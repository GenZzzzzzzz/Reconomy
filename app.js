import {
  CATEGORIES, CONDITIONS, DEFECTS, OPTIONS, OPTION_LABEL, CIRCULAR,
  NO_PACKAGING_FACTOR, RATES_SOURCE, usd, summarize, replan,
} from './logic.js';
import * as api from './api.js';
import { homeHTML, bindHome } from './home.js';

const { analyze, approve, resizeImage, MAX_IMAGES } = api;
await api.detectMode();
// Live AI connection state: 'aws' | 'local' | 'offline'. Read on every render, it can change mid-session.
const currentMode = () => api.mode;
const online = () => api.mode !== 'offline';

const STEPS = ['Upload', 'Assess', 'Compare', 'Approve', 'Result'];

const fresh = () => ({
  step: 0, images: [], loading: false, error: '', startedAt: 0,
  analysisId: null, mode: null, items: [], chosen: [], active: 0, catalog: null,
});
let state = fresh();

const $app = document.getElementById('app');
const $steps = document.getElementById('steps');
const $mode = document.getElementById('mode');
const $navCta = document.getElementById('nav-cta');

// Routing: #assess opens the tool, anything else is the home page.
const viewFromHash = () => (location.hash.startsWith('#assess') ? 'app' : 'home');
let view = viewFromHash();
let unbindHome = () => {};
let ticker = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n) => Math.round(n * 100) + '%';

// Info tip: keyboard focusable, shows on hover or focus.
let tipId = 0;
const tip = (text) => {
  const id = 'tip' + tipId++;
  return `<span class="tip" tabindex="0" aria-describedby="${id}"><i aria-hidden="true">i</i><span class="bubble" role="tooltip" id="${id}">${esc(text)}</span></span>`;
};
const num = (value, tipText, cls = '') => `<span class="numwrap"><span class="num ${cls}">${value}</span>${tip(tipText)}</span>`;
const title = (t, helper) => `<header class="ws-head"><h1>${t}</h1><p class="helper">${helper}</p></header>`;

const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 31V11m0 0l-8 8m8-8l8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 29v6a4 4 0 004 4h20a4 4 0 004-4v-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z" fill="currentColor"/></svg>',
};

// ---------- Nav + stepper ----------
function renderNav() {
  document.body.classList.toggle('is-home', view === 'home');
  document.body.classList.toggle('is-app', view === 'app');
  $navCta.textContent = view === 'home' ? 'Assess returns' : 'Home';
  $navCta.href = view === 'home' ? '#assess' : '#';
  $navCta.classList.toggle('primary', view === 'home');
  const mode = currentMode();
  $mode.textContent = { aws: 'Live · AWS', local: 'Live · Bedrock', offline: 'AI offline' }[mode];
  $mode.className = 'mode ' + (online() ? 'live' : 'offline');
  $mode.title = {
    aws: 'Images go to Amazon S3. Lambda calls Amazon Bedrock and stores the decisions in DynamoDB.',
    local: `The local server sends your photos to Amazon Bedrock (${api.modelId}). Nothing is stored.`,
    offline: api.OFFLINE_MESSAGE,
  }[mode];
}

// Earlier steps are clickable, except while the AI is working or after the plan is approved.
const canJump = (i) => !state.loading && i < state.step && state.step < 4;

function renderSteps() {
  $steps.innerHTML = STEPS.map((s, i) => {
    const c = i < state.step ? 'done' : i === state.step ? 'current' : '';
    const inner = `<span class="sp-dot">${i < state.step ? ICON.check : i + 1}</span><span class="sp-label">${s}</span>`;
    return `<li class="${c}">${canJump(i)
      ? `<button type="button" data-jump="${i}" aria-label="Back to ${s}">${inner}</button>`
      : `<span class="sp-static" ${i === state.step ? 'aria-current="step"' : ''}>${inner}</span>`}</li>`;
  }).join('');
}
// Tooltips open to the left by default; flip to the right when that would leave the screen.
function placeTip(e) {
  const t = e.target.closest?.('.tip');
  if (!t) return;
  const b = t.querySelector('.bubble');
  b.classList.remove('to-right');
  b.style.transform = '';
  if (b.getBoundingClientRect().left < 8) b.classList.add('to-right');
  const over = b.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
  if (over > 0) b.style.transform = `translateX(${-over}px)`;
}
document.addEventListener('focusin', placeTip);
document.addEventListener('mouseover', placeTip);

$steps.addEventListener('click', (e) => {
  const b = e.target.closest('[data-jump]');
  if (b) go(Number(b.dataset.jump));
});

const imgsFor = (item) => item.imageIndexes.map((i) => state.images[i]).filter(Boolean);
const chosenKey = (i) => state.chosen[i] || state.items[i].decision.best;

// Sticky action bar shared by every step.
const actionBar = (info, buttons) => `
  <div class="ws-bar"><div class="ws-bar-inner">
    <div class="ws-bar-info">${info}</div>
    <div class="ws-bar-btns">${buttons}</div>
  </div></div>`;

// ---------- 1. Upload ----------
function screenUpload() {
  const thumbs = state.images.map((src, i) => `
    <figure class="ph">
      <img src="${src}" alt="Returned item photo ${i + 1}">
      <button type="button" class="ph-x" data-remove="${i}" aria-label="Remove photo ${i + 1}">×</button>
    </figure>`).join('');
  const room = MAX_IMAGES - state.images.length;
  return `
    ${title('Upload returned items', 'Add photos of the returns. AI identifies each item, so there is nothing to type.')}
    ${online() ? '' : `<div class="banner warn offline-note" role="status"><span>${esc(api.OFFLINE_MESSAGE)}</span><button type="button" id="recheck">Check again</button></div>`}
    <div class="ws-split">
      <div class="card up-main">
        <label class="dz ${state.images.length ? 'compact' : ''}" for="photos" id="dropzone">
          <span class="dz-ico">${ICON.upload}</span>
          <span class="dz-title">${state.images.length ? 'Add more photos' : 'Drag photos here or click to browse'}</span>
          <span class="dz-sub">JPG, PNG, WEBP or HEIC · up to ${num(MAX_IMAGES, 'Photos per analysis. Several angles of the same item are grouped into one item.')} photos</span>
          <input id="photos" type="file" accept="image/*,.heic,.heif" multiple ${room > 0 ? '' : 'disabled'}>
        </label>
        ${state.images.length ? `<div class="ph-grid">${thumbs}</div>` : ''}
        <div class="error" role="alert">${esc(state.error)}</div>
      </div>
      <aside class="card up-side" aria-labelledby="algo-h">
        <h2 class="side-h" id="algo-h">How Reconomy decides</h2>
        <ol class="algo">
          <li><b>Check the evidence</b><span>AI uses only details visible in the photos. It uses a verified catalog match when it has one; otherwise it keeps the price range cautious and flags weak evidence.</span></li>
          <li><b>Estimate each outcome</b><span>For every route, it estimates what will sell, then subtracts fees, handling, repairs and the value lost while the item waits. This gives each choice one fair number to compare.</span></li>
          <li><b>Bundle only true matches</b><span>Low-value items are bundled only when they are the same compatible type, such as cables or matching shirts. The bundle is used only when it earns more than selling the items separately.</span></li>
          <li><b>Recommend or flag</b><span>The highest cautious recovery value wins. Close calls, unclear items and risky repairs are marked for review; a greener near-equal route is shown too.</span></li>
        </ol>
      </aside>
    </div>
    ${actionBar(
      `${num(state.images.length, 'Photos ready to analyze.')} <span>of ${num(MAX_IMAGES, 'Maximum photos per analysis.')} photos added</span>`,
      `<button type="button" class="primary" id="next" ${state.images.length && online() ? '' : 'disabled'}>${ICON.spark} Analyze with AI</button>`,
    )}`;
}

// ---------- 2. Assess ----------
function itemList() {
  return `
    <aside class="ws-side" aria-label="Items">
      <div class="side-top"><span class="label">Items</span>${num(state.items.length, 'Products the AI found in your photos.')}</div>
      <ul class="qlist">
        ${state.items.map((it, i) => {
          const k = state.step === 3 ? chosenKey(i) : it.decision.best;
          return `<li class="${i === state.active ? 'on' : ''}">
            <button type="button" class="qbtn" data-item="${i}" ${i === state.active ? 'aria-current="true"' : ''}>
              ${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : '<span class="qimg-empty"></span>'}
              <span class="qmeta"><span class="qname">${esc(it.name)}</span><span class="rchip r-${k}">${OPTION_LABEL[k]}</span></span>
            </button>
            <span class="qval">${num(usd(it.decision.results[k].net), 'Net recovery value of this route.')}</span>
          </li>`;
        }).join('')}
      </ul>
    </aside>`;
}

function catalogBanner() {
  const c = state.catalog;
  if (!c || state.mode !== 'local') return '';
  if (!c.ok) return `<div class="banner warn" role="status">${esc(c.error)} Run <span class="mono">scripts/setup_aws.py</span> to enable it.</div>`;
  const hits = state.items.filter((x) => x.priceSource === 'catalog').length;
  return `<div class="banner" role="status"><span class="dot"></span>AWS Lambda matched
    ${num(`${hits}/${state.items.length}`, 'Items found in your product catalog. Verified items use the catalog\'s current reference price; weak matches keep an AI market range.')}
    items to ${num(c.size, 'Products in catalog.csv in Amazon S3.')} catalog products in Amazon S3.</div>`;
}

function gradeMeter(cond) {
  return `<div class="grade" role="img" aria-label="Condition grade ${cond}: ${CONDITIONS[cond].label}">
    ${Object.keys(CONDITIONS).map((g) => `<span class="g ${g === cond ? 'on' : ''}">${g}</span>`).join('')}
  </div>`;
}

const PRICE_TYPE_LABEL = {
  new_street: 'new street price',
  current_market: 'current market price',
  renewed_market: 'renewed market price',
  unknown: 'market estimate',
};
const packagingLabel = (item) => ({
  included: 'Packaging visible',
  missing: 'Packaging missing',
  not_shown: 'Packaging not shown',
}[item.packagingStatus] || 'Packaging not shown');

function priceTile(it) {
  const type = PRICE_TYPE_LABEL[it.priceType] || 'market estimate';
  if (it.priceSource === 'catalog') {
    const checked = it.priceCheckedAt ? ` Last checked ${it.priceCheckedAt}.` : '';
    return `<div class="tile"><span class="label">Reference price <span class="src ok">Verified catalog · ${esc(it.sku)}</span></span>
      ${num(usd(it.estimatedOriginalPrice), `${type} for "${it.catalogName}" from your catalog in Amazon S3, verified by AWS Lambda.${checked} ${it.priceBasis}`, 'tile-v')}
      <span class="tile-sub">AI estimate ${num(usd(it.aiEstimatedPrice), 'The AI range estimate is not used because a verified catalog value is available.')} · match ${num(pct(it.catalogMatchScore || 1), 'How much of the visible identity matched this catalog row.')}</span></div>`;
  }
  const range = it.priceLow !== null && it.priceHigh !== null && it.priceLow !== undefined
    ? `${num(usd(it.priceLow), 'Low current market estimate.')} – ${num(usd(it.priceHigh), 'High current market estimate.')}`
    : 'Range unavailable';
  const source = it.catalogMatchStatus === 'review' || it.catalogMatchStatus === 'ambiguous'
    ? `Catalog check: ${it.matchNote}` : 'No verified catalog match';
  return `<div class="tile"><span class="label">Decision price <span class="src">AI market range</span></span>
    ${num(usd(it.decision.valuation), `Conservative reference used for decisions. It moves the AI typical price toward the low end of its range when identity or price evidence is weak.${it.priceBasis ? ` ${it.priceBasis}` : ''}`, 'tile-v')}
    <span class="tile-sub">AI typical ${num(usd(it.estimatedOriginalPrice), 'AI typical market estimate before the conservative adjustment.')} · range ${range} · ${esc(source)}</span></div>`;
}

function assessDetail(it) {
  const imgs = imgsFor(it);
  const decision = it.decision;
  const evidence = Math.min(it.identityConfidence, it.conditionConfidence, it.priceConfidence);
  const review = decision.reviewReasons || [];
  const type = PRICE_TYPE_LABEL[it.priceType] || 'market estimate';
  return `
    <section class="card detail" aria-label="${esc(it.name)}">
      <div class="det-grid">
        <div class="gallery">
          ${imgs[0] ? `<img class="g-main" src="${imgs[0]}" alt="${esc(it.name)}">` : ''}
          ${imgs.length > 1 ? `<div class="g-row">${imgs.slice(1).map((s) => `<img src="${s}" alt="">`).join('')}</div>` : ''}
        </div>
        <div class="det-body">
          <div class="chips"><span class="chip">${CATEGORIES[it.category].label}</span><span class="chip">${packagingLabel(it)}</span><span class="chip ${it.priceSource === 'catalog' ? 'ok' : ''}">${it.priceSource === 'catalog' ? 'Catalog verified' : 'Market estimate'}</span>${decision.needsReview ? '<span class="chip warn">Review before routing</span>' : ''}</div>
          <h2 class="det-title">${esc(it.name)}</h2>
          ${it.notes ? `<p class="det-note">${esc(it.notes)}</p>` : ''}
          ${it.observedText?.length ? `<div class="det-sec"><span class="label">Visible evidence</span><div class="chips">${it.observedText.map((text) => `<span class="chip">${esc(text)}</span>`).join('')}</div></div>` : ''}
          <div class="det-sec">
            <span class="label">Condition</span>
            ${gradeMeter(it.condition)}
            <span class="grade-txt">${CONDITIONS[it.condition].label.split('·')[1]?.trim() || ''}</span>
          </div>
          <div class="det-sec">
            <span class="label">Defects</span>
            <div class="chips">${it.defects.length ? it.defects.map((d) => `<span class="chip warn">${DEFECTS[d].label}</span>`).join('') : '<span class="chip ok">No visible defects</span>'}</div>
          </div>
          ${review.length ? `<div class="review-note"><b>Check before routing</b><span>${esc(review.join(' '))}</span></div>` : ''}
        </div>
      </div>
      <div class="tiles">
        ${priceTile(it)}
        <div class="tile"><span class="label">Value in current condition</span>
          ${num(usd(decision.asIs), `${type === 'new street price' ? `New street reference ${usd(decision.valuation)} × ${pct(CATEGORIES[it.category].retention)} used-market retention` : `Current market reference ${usd(decision.valuation)}`} × ${CONDITIONS[it.condition].factor} condition factor${it.packagingStatus === 'missing' ? ` × ${NO_PACKAGING_FACTOR} for confirmed missing packaging` : ''}. Rates from ${RATES_SOURCE}.`, 'tile-v')}
          <span class="tile-sub">Cautious value used for decisions</span></div>
        <div class="tile"><span class="label">Evidence confidence</span>
          ${num(pct(evidence), 'Lowest of the AI confidence for identity, condition and price. Weak evidence is flagged for review and uses a cautious price.', 'tile-v')}
          <span class="tile-sub">${num(pct(it.identityConfidence), 'Confidence in the exact item identity.')} identity · ${num(pct(it.conditionConfidence), 'Confidence in the visible condition grade.')} condition · ${num(pct(it.priceConfidence), 'Confidence in the market price range.')} price</span>
          <span class="meter ${decision.needsReview ? 'low' : ''}"><span style="width:${pct(evidence)}"></span></span></div>
      </div>
    </section>`;
}

function screenAssess() {
  if (state.loading) {
    return `
      ${title('AI is assessing your items', 'Identifying each product, grading its condition and pricing every route.')}
      <div class="card scan" aria-live="polite">
        <div class="scan-row">${state.images.map((s) => `<figure class="ph scanning"><img src="${s}" alt=""></figure>`).join('')}</div>
        <div class="progress" role="progressbar" aria-label="Analysis in progress"><span></span></div>
        <div class="scan-meta">
          <ul class="stages">
            <li>Amazon Bedrock identifies and grades each product</li>
            ${currentMode() === 'local' ? '<li>AWS Lambda matches items to your catalog in Amazon S3</li>' : ''}
            <li>Reconomy prices resell, refurbish, bundle, donate and scrap</li>
            <li>Amazon Bedrock writes the reason for each decision</li>
          </ul>
          <span class="elapsed">${num('<span id="elapsed">0</span>s', 'Time since the photos were sent. Usually 5 to 20 seconds.')}</span>
        </div>
      </div>`;
  }
  const it = state.items[state.active];
  return `
    ${title('AI assessment', `Found ${num(state.items.length, 'Products identified in your photos.')} item(s)${api.modelId ? ` · assessed by <span class="mono">${esc(api.modelId)}</span>` : ''}. Pick an item to review it.`)}
    ${catalogBanner()}
    <div class="ws-main">${itemList()}${assessDetail(it)}</div>
    ${actionBar(
      `<span>Reviewing item</span> ${num(`${state.active + 1}/${state.items.length}`, 'Position of this item in the list.')}`,
      `<button type="button" id="back">Back</button><button type="button" class="primary" id="next">Compare routes →</button>`,
    )}`;
}

// ---------- 3. Compare ----------
function compareDetail(it) {
  const d = it.decision;
  const best = d.best;
  const r = d.results[best];
  const maxAbs = Math.max(...OPTIONS.map((k) => Math.abs(d.results[k].net)), 1);
  const bars = OPTIONS.map((k) => {
    const x = d.results[k];
    const w = (Math.abs(x.net) / maxAbs) * 100;
    const cls = !x.viable ? 'off' : k === best ? 'best' : x.net < 0 ? 'neg' : '';
    return `<li class="bar ${cls}">
      <span class="bar-l">${OPTION_LABEL[k]}${k === best ? ' <span class="rec">Best</span>' : ''}${!x.viable ? ' <span class="nv">Not viable</span>' : ''}<span class="circ">${CIRCULAR[k]}</span></span>
      <span class="bar-t"><span style="width:${w.toFixed(1)}%"></span></span>
      ${num(usd(x.net), x.viable ? 'Net recovery value: expected revenue minus all costs, including value lost while waiting.' : `Not possible for this item: ${x.note}`)}
    </li>`;
  }).join('');
  const rows = OPTIONS.map((k) => {
    const x = d.results[k];
    return `<tr class="${k === best ? 'is-best' : ''} ${x.viable ? '' : 'is-off'}">
      <th scope="row">${OPTION_LABEL[k]}<span class="row-note">${esc(x.note)}</span></th>
      <td class="r">${num(usd(x.revenue), x.revNote)}</td>
      <td class="r">${num(usd(x.costs), x.costNote)}</td>
      <td class="r">${num(usd(x.net), 'Expected revenue minus all costs.')}</td>
    </tr>`;
  }).join('');
  return `
    <div class="cmp-col">
      <section class="card option best rec-card" aria-label="Recommendation">
        <div class="rec-top">
          <div>
            <span class="badge">Recommended</span>
            <h2 class="rec-route">${OPTION_LABEL[best]}</h2>
            <p class="rec-item">${esc(it.name)}</p>
            ${best === 'bundle' ? `<p class="rec-lot">Lot ${esc(r.lot.id)} · with ${r.lot.items.filter((n) => n !== it.name).map(esc).join(', ') || 'other items'}</p>` : ''}
          </div>
          <div class="rec-kpis">
            <div><span class="label">Net recovery value</span>${num(usd(r.net), 'Expected revenue minus all costs for the recommended route.', 'rec-big')}</div>
            <div><span class="label">Saved vs scrap</span>${num(usd(d.savings), 'Net recovery value of the recommended route minus that of scrapping.', 'rec-big accent')}</div>
          </div>
        </div>
        ${d.greener ? `<p class="greener"><span class="leaf" aria-hidden="true">♻</span>${OPTION_LABEL[d.greener.route]} is a greener option for ${num(usd(d.greener.gap), 'How much less it brings back than the recommended route.')} less.</p>` : ''}
        ${d.needsReview ? `<div class="review-note"><b>Review before routing</b><span>${esc(d.reviewReasons.join(' '))}</span></div>` : ''}
        ${d.haircut > 0 ? `<p class="risk">Cautious price: ${num(usd(d.haircut), 'Difference between the AI typical price and the conservative price used in the decision.')} below the AI typical estimate because identity or price evidence is limited.</p>` : ''}
        <div class="rec-why">
          <span class="label">Why ${OPTION_LABEL[best].toLowerCase()}${it.reasonSource === 'bedrock' ? ' · written by Amazon Bedrock' : ''}</span>
          <p>${esc(it.reason)}</p>
        </div>
      </section>
      <section class="card">
        <h3 class="sec-h">Net recovery value by route</h3>
        <ul class="bars">${bars}</ul>
      </section>
      <section class="card table-wrap">
        <h3 class="sec-h">Breakdown</h3>
        <table class="brk">
          <thead><tr><th scope="col">Route</th><th scope="col" class="r">Revenue</th><th scope="col" class="r">Costs</th><th scope="col" class="r">Net</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </div>`;
}

function screenCompare() {
  const it = state.items[state.active];
  return `
    ${title('Compare the routes', 'Every route uses the same cautious recovery estimate: chance of sale, costs and time loss. The highest result is recommended.')}
    <div class="ws-main">${itemList()}${compareDetail(it)}</div>
    ${actionBar(
      `<span>Item</span> ${num(`${state.active + 1}/${state.items.length}`, 'Position of this item in the list.')}`,
      `<button type="button" id="back">Back</button><button type="button" class="primary" id="next">Review plan →</button>`,
    )}`;
}

// ---------- 4. Approve ----------
function screenApprove() {
  const t = summarize(state.items, state.chosen);
  const overrides = state.items.filter((it, i) => chosenKey(i) !== it.decision.best).length;
  const rows = state.items.map((it, i) => {
    const k = chosenKey(i);
    const net = it.decision.results[k].net;
    const diff = net - it.decision.results[it.decision.best].net;
    const seg = OPTIONS.map((o) => {
      const viable = it.decision.results[o].viable;
      return `<label class="${viable ? '' : 'off'} ${o === it.decision.best ? 'rec' : ''}">
        <input type="radio" name="route${i}" value="${o}" data-route="${i}" ${k === o ? 'checked' : ''} ${viable ? '' : 'disabled'}>
        <span>${OPTION_LABEL[o]}</span></label>`;
    }).join('');
    return `<li class="ap-row ${k !== it.decision.best ? 'changed' : ''}">
      <div class="ap-item">${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : ''}<span><b>${esc(it.name)}</b><span class="ap-sub">AI recommends ${OPTION_LABEL[it.decision.best].toLowerCase()}${k === 'bundle' ? ` · bundle ${esc(it.decision.results.bundle.lot.id)} of ${it.decision.results.bundle.lot.size}` : ''}${it.decision.needsReview ? ' · check evidence' : ''}</span></span></div>
      <fieldset class="seg-ctl"><legend class="sr-only">Route for ${esc(it.name)}</legend>${seg}</fieldset>
      <div class="ap-net">${num(usd(net), 'Net recovery value of the selected route.')}
        ${diff < 0 ? `<span class="ap-diff">${num(usd(diff), 'Profit lost compared with the AI recommendation.', 'bad')}</span>` : ''}</div>
    </li>`;
  }).join('');
  return `
    ${title('Approve the plan', 'Review any amber flags first. The AI recommendation is preselected, but you can choose another route.')}
    <div class="kpis">
      <div class="card kpi"><span class="label">Net recovery value</span>${num(usd(t.net), 'Sum across all items with the selected routes.', 'kpi-v')}</div>
      <div class="card kpi"><span class="label">Saved vs scrapping</span>${num(usd(t.saved), 'How much more the plan earns than scrapping every item.', 'kpi-v accent')}</div>
      <div class="card kpi"><span class="label">Changed by you</span>${num(overrides, 'Items where you picked a different route than the AI.', 'kpi-v')}</div>
    </div>
    <ul class="ap-list">${rows}</ul>
    <div class="error" role="alert">${esc(state.error)}</div>
    ${actionBar(
      `${num(state.items.length, 'Items in this plan.')} <span>items ready</span>`,
      `<button type="button" id="back">Back</button><button type="button" class="primary" id="next" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Saving…' : 'Approve plan'}</button>`,
    )}`;
}

// ---------- 5. Result ----------
const NEXT = {
  resell: ['Clean and photograph', 'List as-is', 'Ship as soon as it sells'],
  refurbish: ['Send to repair', 'Run a quality check', 'List as refurbished'],
  donate: ['Pack the item', 'Ship to the partner charity', 'File the donation receipt'],
  scrap: ['Remove batteries and data', 'Send to the recycler', 'Log the salvage payment'],
  bundle: ['Group with the other items in the lot', 'List the lot as one listing', 'Ship the lot together'],
};

function planCSV() {
  // Prefix cells that a spreadsheet would treat as a formula.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Item', 'Category', 'Condition', 'Approved route', 'AI recommendation', 'Net recovery value (USD)', 'Saved vs scrap (USD)', 'Price source', 'Reason'];
  const lines = state.items.map((it, i) => {
    const k = chosenKey(i);
    const r = it.decision.results[k];
    return [it.name, CATEGORIES[it.category].label, it.condition, OPTION_LABEL[k], OPTION_LABEL[it.decision.best],
      r.net.toFixed(2), (r.net - it.decision.results.scrap.net).toFixed(2),
      it.priceSource === 'catalog' ? `Catalog ${it.sku}` : 'AI estimate', it.reason].map(cell).join(',');
  });
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

function screenResult() {
  const t = summarize(state.items, state.chosen);
  const byRoute = OPTIONS.map((k) => {
    const idx = state.items.map((_, i) => i).filter((i) => chosenKey(i) === k);
    const net = idx.reduce((s, i) => s + state.items[i].decision.results[k].net, 0);
    return { k, n: idx.length, net };
  }).filter((x) => x.n);
  const list = state.items.map((it, i) => {
    const k = chosenKey(i);
    const r = it.decision.results[k];
    const saved = r.net - it.decision.results.scrap.net;
    return `<article class="card res ${k === it.decision.best ? '' : 'override'}">
      <div class="res-head">
        ${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : ''}
        <div><h3>${esc(it.name)}</h3><span class="rchip r-${k}">${OPTION_LABEL[k]}</span>
          ${k !== it.decision.best ? `<span class="chip warn">Changed from ${OPTION_LABEL[it.decision.best].toLowerCase()}</span>` : ''}
          ${it.decision.needsReview ? '<span class="chip warn">Evidence needs review</span>' : ''}</div>
      </div>
      <div class="res-kv">
        <div><span class="label">Net recovery value</span>${num(usd(r.net), 'Expected revenue minus all costs for the approved route.')}</div>
        <div><span class="label">Saved vs scrap</span>${num(usd(saved), 'Approved route minus scrapping.', 'accent')}</div>
      </div>
      <p class="res-why">${esc(k === it.decision.best ? it.reason : `You picked ${OPTION_LABEL[k].toLowerCase()} instead of the recommended ${OPTION_LABEL[it.decision.best].toLowerCase()}.`)}</p>
      <span class="label">Next steps</span>
      <ul class="todo">${NEXT[k].map((s) => `<li><label><input type="checkbox"> ${s}</label></li>`).join('')}</ul>
    </article>`;
  }).join('');
  return `
    ${title('Recovery plan approved', {
      aws: 'Saved in DynamoDB. Here is what each item earns and what to do next.',
      local: 'Assessed by Amazon Bedrock. Here is what each item earns and what to do next.',
    }[state.mode] || 'Here is what each item earns and what to do next.')}
    <div class="card res-hero">
      <div class="res-hero-main"><span class="label">Saved versus scrapping everything</span>${num(usd(t.saved), 'Extra money recovered compared with scrapping every item.', 'huge')}</div>
      <div class="res-hero-side">
        <div><span class="label">Net recovery value</span>${num(usd(t.net), 'Sum across all approved routes.', 'kpi-v')}</div>
        <div><span class="label">Kept in use</span>${num(`${t.diverted}/${state.items.length}`, 'Items resold, refurbished, bundled or donated instead of scrapped.', 'kpi-v')}</div>
      </div>
      <ul class="route-sum">${byRoute.map((x) => `<li><span class="rchip r-${x.k}">${OPTION_LABEL[x.k]}</span>${num(x.n, `Items routed to ${OPTION_LABEL[x.k].toLowerCase()}.`)}<span class="muted">items ·</span>${num(usd(x.net), `Net recovery value from items routed to ${OPTION_LABEL[x.k].toLowerCase()}.`)}</li>`).join('')}</ul>
    </div>
    <div class="res-grid">${list}</div>
    <p class="tagline">AWS enables scalable AI-powered inventory recovery.</p>
    ${actionBar(
      `${num(usd(t.saved), 'Total saved versus scrapping.', 'accent')} <span>recovered</span>`,
      `<button type="button" id="csv">Download plan (CSV)</button><button type="button" class="primary" id="again">Process more returns</button>`,
    )}`;
}

// ---------- Wiring ----------
const screens = [screenUpload, screenAssess, screenCompare, screenApprove, screenResult];

function render(focus = true) {
  clearInterval(ticker);
  renderNav();
  unbindHome();
  unbindHome = () => {};
  if (view === 'home') {
    $app.innerHTML = homeHTML({ num });
    unbindHome = bindHome($app);
    return;
  }
  document.getElementById('topnav').classList.add('solid');
  renderSteps();
  $app.innerHTML = screens[state.step]();
  bind();
  if (state.loading && state.step === 1) {
    const tick = () => {
      const el = document.getElementById('elapsed');
      if (el) el.textContent = String(Math.floor((Date.now() - state.startedAt) / 1000));
    };
    tick();
    ticker = setInterval(tick, 1000);
  }
  if (focus) $app.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => {
  const next = viewFromHash();
  const changed = next !== view;
  view = next;
  if (changed) { render(false); window.scrollTo(0, 0); }
  if (view === 'home' && location.hash.length > 1) {
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

const go = (n) => { state.step = n; state.error = ''; render(); window.scrollTo(0, 0); };

let adding = Promise.resolve();
// Queued so photos added in quick succession are all kept, in order.
function addFiles(files) {
  const list = [...files];
  adding = adding.then(async () => {
    const room = MAX_IMAGES - state.images.length;
    const errors = [];
    if (list.length > room) errors.push(`Only ${MAX_IMAGES} photos per run. ${list.length - Math.max(room, 0)} extra photo(s) skipped.`);
    const results = await Promise.allSettled(list.slice(0, Math.max(room, 0)).map((f) => resizeImage(f)));
    for (const r of results) {
      if (r.status === 'fulfilled') state.images.push(r.value);
      else errors.push(r.reason?.message || 'A photo could not be read.');
    }
    state.error = errors.join(' ');
    if (state.step === 0) render(false);
  });
  return adding;
}

async function runAnalysis() {
  await adding; // never analyze before every photo has finished processing
  if (!state.images.length) return;
  state.loading = true;
  state.startedAt = Date.now();
  go(1);
  try {
    const res = await analyze(state.images);
    if (!res.items?.length) throw new Error('No products were recognised in these photos. Try clearer shots.');
    state.items = res.items;
    state.analysisId = res.id;
    state.catalog = res.catalog || null;
    state.mode = res.mode;
    state.chosen = res.items.map((x) => x.decision.best);
    state.active = 0;
    state.loading = false;
    render();
  } catch (e) {
    state.loading = false;
    state.step = 0;
    state.error = e.message || 'Analysis failed.';
    render();
  }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bind() {
  const $ = (id) => document.getElementById(id);
  $('back')?.addEventListener('click', () => go(state.step - 1));
  $('again')?.addEventListener('click', () => { state = fresh(); render(); window.scrollTo(0, 0); });
  $('csv')?.addEventListener('click', () => download(`reconomy-plan-${new Date().toISOString().slice(0, 10)}.csv`, planCSV(), 'text/csv;charset=utf-8'));
  document.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => {
    state.active = Number(b.dataset.item);
    render(false);
    document.querySelector(`[data-item="${state.active}"]`)?.focus();
  }));

  if (state.step === 0) {
    $('photos').addEventListener('change', (e) => addFiles(e.target.files));
    const dz = $('dropzone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); });
    document.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      state.images.splice(Number(b.dataset.remove), 1);
      render(false);
    }));
    $('next').addEventListener('click', runAnalysis);
    $('recheck')?.addEventListener('click', async () => {
      await api.detectMode();
      state.error = online() ? '' : 'Still offline. Is the server running?';
      render(false);
    });
  }
  if (state.step === 1 && !state.loading) $('next').addEventListener('click', () => go(2));
  if (state.step === 2) $('next').addEventListener('click', () => go(3));
  if (state.step === 3) {
    document.querySelectorAll('[data-route]').forEach((s) => s.addEventListener('change', () => {
      const i = Number(s.dataset.route);
      state.chosen[i] = s.value;
      ({ chosen: state.chosen } = replan(state.items, state.chosen, i)); // re-price lots
      render(false);
      document.querySelector(`input[name="route${i}"]:checked`)?.focus();
    }));
    $('next').addEventListener('click', async () => {
      state.loading = true; render(false);
      try {
        await approve(state.analysisId, state.items.map((_, i) => chosenKey(i)));
        state.loading = false; go(4);
      } catch (e) {
        state.loading = false; state.error = e.message; render(false);
      }
    });
  }
}

render(false);
// Skip link moves focus without touching the hash (the hash is used for routing).
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); $app.focus(); });
if (view === 'home' && location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();
