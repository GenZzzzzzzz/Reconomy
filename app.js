import {
  CATEGORIES, CONDITIONS, DEFECTS, OPTIONS, OPTION_LABEL, FEE_RATE, HANDLING, DONATE_TAX_RATE,
  NO_PACKAGING_FACTOR, RATES_SOURCE, usd, summarize,
} from './logic.js';
import * as api from './api.js';
import { homeHTML, bindHome } from './home.js';

const { analyze, approve, resizeImage, MAX_IMAGES } = api;
await api.detectMode();
const mode = api.mode; // 'aws' | 'local' | 'demo'
const isReal = mode !== 'demo';

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
  $mode.textContent = { aws: 'Live · AWS', local: 'Live · Bedrock', demo: 'Demo mode' }[mode];
  $mode.className = 'mode ' + (isReal ? 'live' : 'demo');
  $mode.title = {
    aws: 'Images go to Amazon S3. Lambda calls Amazon Bedrock and stores the decisions in DynamoDB.',
    local: `The local server sends your photos to Amazon Bedrock (${api.modelId}). Nothing is stored.`,
    demo: 'No AI backend found. The AI is simulated in the browser and results are examples.',
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
      <aside class="card up-side">
        <h2 class="side-h">For the best result</h2>
        <ul class="checks">
          <li>${ICON.check}<span>One product per photo, or several angles of the same one.</span></li>
          <li>${ICON.check}<span>Good light, with any damage close up.</span></li>
          <li>${ICON.check}<span>Show the box or tags if the item has them.</span></li>
        </ul>
        <h2 class="side-h">What happens next</h2>
        <ol class="mini-flow">
          <li><b>${isReal ? 'Amazon Bedrock' : 'Simulated AI'}</b> identifies and grades each item.</li>
          ${mode === 'local' ? '<li><b>AWS Lambda</b> prices it from your catalog in <b>Amazon S3</b>.</li>' : ''}
          <li><b>Reconomy</b> prices all four routes and picks the best.</li>
        </ol>
      </aside>
    </div>
    ${actionBar(
      `${num(state.images.length, 'Photos ready to analyze.')} <span>of ${num(MAX_IMAGES, 'Maximum photos per analysis.')} photos added</span>`,
      `<button type="button" class="primary" id="next" ${state.images.length ? '' : 'disabled'}>${ICON.spark} Analyze with AI</button>`,
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
            <span class="qval">${num(usd(it.decision.results[k].net), 'Net profit of this route.')}</span>
          </li>`;
        }).join('')}
      </ul>
    </aside>`;
}

function catalogBanner() {
  const c = state.catalog;
  if (!c || mode !== 'local') return '';
  if (!c.ok) return `<div class="banner warn" role="status">${esc(c.error)} Run <span class="mono">scripts/setup_aws.py</span> to enable it.</div>`;
  const hits = state.items.filter((x) => x.priceSource === 'catalog').length;
  return `<div class="banner" role="status"><span class="dot"></span>AWS Lambda matched
    ${num(`${hits}/${state.items.length}`, 'Items found in your product catalog. Matched items use the real retail price instead of the AI estimate.')}
    items to ${num(c.size, 'Products in catalog.csv in Amazon S3.')} catalog products in Amazon S3.</div>`;
}

function gradeMeter(cond) {
  return `<div class="grade" role="img" aria-label="Condition grade ${cond}: ${CONDITIONS[cond].label}">
    ${Object.keys(CONDITIONS).map((g) => `<span class="g ${g === cond ? 'on' : ''}">${g}</span>`).join('')}
  </div>`;
}

function priceTile(it) {
  if (it.priceSource === 'catalog') {
    return `<div class="tile"><span class="label">Original price <span class="src ok">Catalog · ${esc(it.sku)}</span></span>
      ${num(usd(it.estimatedOriginalPrice), `Real retail price of "${it.catalogName}" from your catalog in Amazon S3, matched by AWS Lambda.`, 'tile-v')}
      <span class="tile-sub">AI guessed ${num(usd(it.aiEstimatedPrice), 'The AI estimate from the photo. Replaced by the catalog price.')}</span></div>`;
  }
  const why = it.matchNote ? ` Not in catalog: ${it.matchNote}` : '';
  return `<div class="tile"><span class="label">Original price <span class="src">AI estimate</span></span>
    ${num(usd(it.estimatedOriginalPrice), `AI estimate of the new retail price, based on the photos.${why}`, 'tile-v')}
    <span class="tile-sub">Not found in the catalog</span></div>`;
}

function assessDetail(it) {
  const imgs = imgsFor(it);
  const lowConf = it.confidence < 0.6;
  return `
    <section class="card detail" aria-label="${esc(it.name)}">
      <div class="det-grid">
        <div class="gallery">
          ${imgs[0] ? `<img class="g-main" src="${imgs[0]}" alt="${esc(it.name)}">` : ''}
          ${imgs.length > 1 ? `<div class="g-row">${imgs.slice(1).map((s) => `<img src="${s}" alt="">`).join('')}</div>` : ''}
        </div>
        <div class="det-body">
          <div class="chips"><span class="chip">${CATEGORIES[it.category].label}</span><span class="chip">${it.hasPackaging ? 'Has packaging' : 'No packaging'}</span>${lowConf ? '<span class="chip warn">Check manually</span>' : ''}</div>
          <h2 class="det-title">${esc(it.name)}</h2>
          ${it.notes ? `<p class="det-note">${esc(it.notes)}</p>` : ''}
          <div class="det-sec">
            <span class="label">Condition</span>
            ${gradeMeter(it.condition)}
            <span class="grade-txt">${CONDITIONS[it.condition].label.split('·')[1]?.trim() || ''}</span>
          </div>
          <div class="det-sec">
            <span class="label">Defects</span>
            <div class="chips">${it.defects.length ? it.defects.map((d) => `<span class="chip warn">${DEFECTS[d].label}</span>`).join('') : '<span class="chip ok">No visible defects</span>'}</div>
          </div>
        </div>
      </div>
      <div class="tiles">
        ${priceTile(it)}
        <div class="tile"><span class="label">Value in current condition</span>
          ${num(usd(it.decision.asIs), `Original price x ${pct(CATEGORIES[it.category].retention)} used-market retention x ${CONDITIONS[it.condition].factor} condition factor${it.hasPackaging ? '' : ` x ${NO_PACKAGING_FACTOR} for missing packaging`}. Rates from ${RATES_SOURCE}.`, 'tile-v')}
          <span class="tile-sub">What it sells for as-is</span></div>
        <div class="tile"><span class="label">AI confidence</span>
          ${num(pct(it.confidence), 'How sure the model is about its identification. Below 60% is worth a manual check.', 'tile-v')}
          <span class="meter ${lowConf ? 'low' : ''}"><span style="width:${pct(it.confidence)}"></span></span></div>
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
            <li>${isReal ? 'Amazon Bedrock identifies and grades each product' : 'Simulating AI recognition'}</li>
            ${mode === 'local' ? '<li>AWS Lambda matches items to your catalog in Amazon S3</li>' : ''}
            <li>Reconomy prices resell, refurbish, donate and scrap</li>
            ${isReal ? '<li>Amazon Bedrock writes the reason for each decision</li>' : ''}
          </ul>
          <span class="elapsed">${num('<span id="elapsed">0</span>s', 'Time since the photos were sent. Usually 5 to 20 seconds.')}</span>
        </div>
      </div>`;
  }
  const it = state.items[state.active];
  return `
    ${title('AI assessment', `Found ${num(state.items.length, 'Products identified in your photos.')} item(s)${isReal && api.modelId ? ` · assessed by <span class="mono">${esc(api.modelId)}</span>` : ''}. Pick an item to review it.`)}
    ${catalogBanner()}
    <div class="ws-main">${itemList()}${assessDetail(it)}</div>
    ${actionBar(
      `<span>Reviewing item</span> ${num(`${state.active + 1}/${state.items.length}`, 'Position of this item in the list.')}`,
      `<button type="button" id="back">Back</button><button type="button" class="primary" id="next">Compare routes →</button>`,
    )}`;
}

// ---------- 3. Compare ----------
const REV_TIP = {
  resell: 'Used price for the item as-is.',
  refurbish: 'Refurbished price, close to the full used-market value.',
  donate: () => `Tax benefit: fair value x ${pct(DONATE_TAX_RATE)}.`,
  scrap: 'Material value paid by the recycler.',
};
const costTip = (it, k) => ({
  resell: `${pct(FEE_RATE)} marketplace fees plus $${HANDLING} handling.`,
  refurbish: `Repairs ${usd(it.decision.repairCost)}, ${pct(FEE_RATE)} fees and $${HANDLING} handling.`,
  donate: 'Shipping to the partner charity.',
  scrap: 'Disposal fee for this category.',
}[k]);
const revTip = (k) => (typeof REV_TIP[k] === 'function' ? REV_TIP[k]() : REV_TIP[k]);

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
      <span class="bar-l">${OPTION_LABEL[k]}${k === best ? ' <span class="rec">Best</span>' : ''}${!x.viable ? ' <span class="nv">Not viable</span>' : ''}</span>
      <span class="bar-t"><span style="width:${w.toFixed(1)}%"></span></span>
      ${num(usd(x.net), x.viable ? 'Net profit: revenue minus costs.' : `Not possible for this item: ${x.note}`)}
    </li>`;
  }).join('');
  const rows = OPTIONS.map((k) => {
    const x = d.results[k];
    return `<tr class="${k === best ? 'is-best' : ''} ${x.viable ? '' : 'is-off'}">
      <th scope="row">${OPTION_LABEL[k]}<span class="row-note">${esc(x.note)}</span></th>
      <td class="r">${num(usd(x.revenue), revTip(k))}</td>
      <td class="r">${num(usd(x.costs), costTip(it, k))}</td>
      <td class="r">${num(usd(x.net), 'Revenue minus costs.')}</td>
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
          </div>
          <div class="rec-kpis">
            <div><span class="label">Net profit</span>${num(usd(r.net), 'Revenue minus costs for the recommended route.', 'rec-big')}</div>
            <div><span class="label">Saved vs scrap</span>${num(usd(d.savings), 'Net profit of the recommended route minus the net profit of scrapping.', 'rec-big accent')}</div>
          </div>
        </div>
        <div class="rec-why">
          <span class="label">Why ${OPTION_LABEL[best].toLowerCase()}${it.reasonSource === 'bedrock' ? ' · written by Amazon Bedrock' : ''}</span>
          <p>${esc(it.reason)}</p>
        </div>
      </section>
      <section class="card">
        <h3 class="sec-h">Net profit by route</h3>
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
    ${title('Compare the routes', 'Every route is priced by net profit. The best one is recommended.')}
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
      <div class="ap-item">${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : ''}<span><b>${esc(it.name)}</b><span class="ap-sub">AI recommends ${OPTION_LABEL[it.decision.best].toLowerCase()}</span></span></div>
      <fieldset class="seg-ctl"><legend class="sr-only">Route for ${esc(it.name)}</legend>${seg}</fieldset>
      <div class="ap-net">${num(usd(net), 'Expected net profit for the selected route.')}
        ${diff < 0 ? `<span class="ap-diff">${num(usd(diff), 'Profit lost compared with the AI recommendation.', 'bad')}</span>` : ''}</div>
    </li>`;
  }).join('');
  return `
    ${title('Approve the plan', 'The AI recommendation is preselected. Change a route only if you need to.')}
    <div class="kpis">
      <div class="card kpi"><span class="label">Total net profit</span>${num(usd(t.net), 'Sum of net profit across all items with the selected routes.', 'kpi-v')}</div>
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
};

function planCSV() {
  // Prefix cells that a spreadsheet would treat as a formula.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Item', 'Category', 'Condition', 'Approved route', 'AI recommendation', 'Net profit (USD)', 'Saved vs scrap (USD)', 'Price source', 'Reason'];
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
          ${k !== it.decision.best ? `<span class="chip warn">Changed from ${OPTION_LABEL[it.decision.best].toLowerCase()}</span>` : ''}</div>
      </div>
      <div class="res-kv">
        <div><span class="label">Net profit</span>${num(usd(r.net), 'Revenue minus costs for the approved route.')}</div>
        <div><span class="label">Saved vs scrap</span>${num(usd(saved), 'Approved route net profit minus scrapping net profit.', 'accent')}</div>
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
      demo: 'Demo mode does not save anything. Here is what each item would earn.',
    }[mode])}
    <div class="card res-hero">
      <div class="res-hero-main"><span class="label">Saved versus scrapping everything</span>${num(usd(t.saved), 'Extra money recovered compared with scrapping every item.', 'huge')}</div>
      <div class="res-hero-side">
        <div><span class="label">Total net profit</span>${num(usd(t.net), 'Sum of net profit across all approved routes.', 'kpi-v')}</div>
        <div><span class="label">Items</span>${num(state.items.length, 'Products in this plan.', 'kpi-v')}</div>
      </div>
      <ul class="route-sum">${byRoute.map((x) => `<li><span class="rchip r-${x.k}">${OPTION_LABEL[x.k]}</span>${num(x.n, `Items routed to ${OPTION_LABEL[x.k].toLowerCase()}.`)}<span class="muted">items ·</span>${num(usd(x.net), `Net profit from items routed to ${OPTION_LABEL[x.k].toLowerCase()}.`)}</li>`).join('')}</ul>
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
  }
  if (state.step === 1 && !state.loading) $('next').addEventListener('click', () => go(2));
  if (state.step === 2) $('next').addEventListener('click', () => go(3));
  if (state.step === 3) {
    document.querySelectorAll('[data-route]').forEach((s) => s.addEventListener('change', () => {
      const i = Number(s.dataset.route);
      state.chosen[i] = s.value;
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
