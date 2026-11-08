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
  step: 0, images: [], loading: false, error: '',
  analysisId: null, mode: null, items: [], chosen: [], active: 0, approved: false, catalog: null,
});
let state = fresh();

const $app = document.getElementById('app');
const $steps = document.getElementById('steps');
const $mode = document.getElementById('mode');
const $navCta = document.getElementById('nav-cta');

// Routing: #assess (or #assess/...) opens the tool, anything else is the home page.
const viewFromHash = () => (location.hash.startsWith('#assess') ? 'app' : 'home');
let view = viewFromHash();
let unbindHome = () => {};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n) => Math.round(n * 100) + '%';

// Info tip: keyboard focusable, shows on hover or focus.
let tipId = 0;
const tip = (text) => {
  const id = 'tip' + tipId++;
  return `<span class="tip" tabindex="0" aria-describedby="${id}"><i aria-hidden="true">i</i><span class="bubble" role="tooltip" id="${id}">${esc(text)}</span></span>`;
};
const num = (value, tipText, cls = '') => `<span class="numwrap"><span class="num ${cls}">${value}</span>${tip(tipText)}</span>`;
const title = (t, helper) => `<h1>${t}</h1><p class="helper">${helper}</p>`;

function renderSteps() {
  $steps.innerHTML = STEPS.map((s, i) => {
    const c = i < state.step ? 'done' : i === state.step ? 'current' : '';
    return `<li class="${c}" ${i === state.step ? 'aria-current="step"' : ''}><span class="n">0${i + 1}</span><span class="t">${s}</span></li>`;
  }).join('');
}

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

const imgsFor = (item) => item.imageIndexes.map((i) => state.images[i]).filter(Boolean);
const chosenKey = (i) => state.chosen[i] || state.items[i].decision.best;

// ---------- 1. Upload ----------
function screenUpload() {
  const thumbs = state.images.map((src, i) => `
    <figure class="thumb">
      <img src="${src}" alt="Returned item photo ${i + 1}">
      <button class="remove" data-remove="${i}" aria-label="Remove photo ${i + 1}">×</button>
    </figure>`).join('');
  return `
    ${title('Upload returned items', 'Drop one or more photos. AI identifies each item, so there is nothing to type.')}
    <div class="card">
      <label class="drop big-drop" for="photos" id="dropzone">
        <span class="drop-title">Drag photos here or click to browse</span>
        <span class="drop-sub">Up to <span class="num">${MAX_IMAGES}</span>${tip('More photos per run make the request slower. Several angles of the same item are grouped together.')} images · JPG, PNG, WEBP, HEIC</span>
        <input id="photos" type="file" accept="image/*,.heic,.heif" multiple>
      </label>
      ${state.images.length ? `<div class="thumbs">${thumbs}</div>` : ''}
      <div class="error" role="alert">${esc(state.error)}</div>
    </div>
    <div class="actions"><span class="label">${num(state.images.length, 'Photos ready to analyze.')} photo(s) selected</span>
      <button class="primary" id="next" ${state.images.length ? '' : 'disabled'}>Analyze with AI</button></div>`;
}

// ---------- 2. Assess ----------
function priceRows(it) {
  if (it.priceSource === 'catalog') {
    return `<div class="kv"><span>Original price <span class="tag on">Catalog · ${esc(it.sku)}</span></span>${num(usd(it.estimatedOriginalPrice), `Real retail price of "${it.catalogName}" from your catalog in Amazon S3, matched by AWS Lambda.`)}</div>
      <div class="kv"><span>AI price estimate (not used)</span>${num(usd(it.aiEstimatedPrice), 'What the AI guessed from the photo. Replaced by the catalog price.')}</div>`;
  }
  const why = it.matchNote ? ` Not in catalog: ${it.matchNote}` : '';
  return `<div class="kv"><span>Original price <span class="tag warn">AI estimate</span></span>${num(usd(it.estimatedOriginalPrice), `AI estimate of the new retail price, based on the photos.${why}`)}</div>`;
}

function catalogBanner() {
  const c = state.catalog;
  if (!c || mode !== 'local') return '';
  if (!c.ok) return `<div class="card banner warn" role="status">${esc(c.error)} Run <span class="mono">scripts/setup_aws.py</span> to enable it.</div>`;
  const hits = state.items.filter((x) => x.priceSource === 'catalog').length;
  return `<div class="card banner" role="status">AWS Lambda <span class="mono">${esc(c.function)}</span> matched
    ${num(`${hits}/${state.items.length}`, 'Items found in your product catalog. Matched items use the real retail price instead of the AI estimate.')}
    items against ${num(c.size, 'Products in catalog.csv in Amazon S3.')} products in Amazon S3. Rates: ${esc(RATES_SOURCE)}.</div>`;
}
function screenAssess() {
  if (state.loading) {
    return `
      ${title('AI is assessing your items', 'Identifying each product, grading its condition and estimating its value.')}
      <div class="card scan" aria-live="polite">
        <div class="thumbs">${state.images.map((s) => `<figure class="thumb scanning"><img src="${s}" alt=""></figure>`).join('')}</div>
        <ol class="pipeline">
          <li>${mode === 'aws' ? 'Uploading images to Amazon S3' : 'Preparing images'}</li>
          <li>${isReal ? 'Amazon Bedrock is identifying the products' : 'Simulating AI recognition'}</li>
          ${mode === 'local' ? '<li>AWS Lambda is matching items to your catalog in Amazon S3</li>' : ''}
          <li>${mode === 'aws' ? 'AWS Lambda is calculating profit for each route' : 'Calculating profit for each route'}</li>
          ${isReal ? '<li>Amazon Bedrock is writing the explanation</li>' : ''}
        </ol>
      </div>`;
  }
  const cards = state.items.map((it) => `
    <div class="card item">
      <div class="item-imgs">${imgsFor(it).map((s) => `<img src="${s}" alt="${esc(it.name)}">`).join('')}</div>
      <div class="item-body">
        <h3>${esc(it.name)}</h3>
        <div class="tags">
          <span class="tag">${CATEGORIES[it.category].label}</span>
          <span class="tag">${CONDITIONS[it.condition].label}</span>
          ${it.defects.map((d) => `<span class="tag warn">${DEFECTS[d].label}</span>`).join('')}
          <span class="tag">${it.hasPackaging ? 'Has packaging' : 'No packaging'}</span>
        </div>
        ${priceRows(it)}
        <div class="kv"><span>Value in current condition</span>${num(usd(it.decision.asIs), `Original price x ${pct(CATEGORIES[it.category].retention)} used-market retention x ${CONDITIONS[it.condition].factor} condition factor${it.hasPackaging ? '' : ` x ${NO_PACKAGING_FACTOR} for missing packaging`}. Rates from ${RATES_SOURCE}.`)}</div>
        <div class="kv"><span>AI confidence</span>${num(pct(it.confidence), 'How sure the model is about its identification. Below 60% is worth a manual check.')}</div>
        ${it.notes ? `<p class="note">${esc(it.notes)}</p>` : ''}
      </div>
    </div>`).join('');
  return `
    ${title('AI assessment', `Found ${state.items.length} item(s) in your photos${isReal && api.modelId ? `, assessed by <span class="mono">${esc(api.modelId)}</span> on Amazon Bedrock` : ''}. Check the details, then compare the options.`)}
    ${catalogBanner()}
    <div class="grid">${cards}</div>
    <div class="actions"><button id="back">Back</button><button class="primary" id="next">Compare options</button></div>`;
}

// ---------- 3. Compare ----------
function optionCard(it, k) {
  const r = it.decision.results[k];
  const best = k === it.decision.best;
  const costTip = {
    resell: `${pct(FEE_RATE)} marketplace fees plus $${HANDLING} handling.`,
    refurbish: `Repairs ${usd(it.decision.repairCost)}, ${pct(FEE_RATE)} fees and $${HANDLING} handling.`,
    donate: 'Shipping to the partner charity.',
    scrap: 'Disposal fee for this category.',
  }[k];
  const revTip = {
    resell: 'Used price for the item as-is.',
    refurbish: 'Refurbished price, close to the full used-market value.',
    donate: `Tax benefit: fair value x ${pct(DONATE_TAX_RATE)}.`,
    scrap: 'Material value paid by the recycler.',
  }[k];
  return `<div class="card option ${best ? 'best' : ''} ${r.viable ? '' : 'unviable'}">
    ${best ? '<span class="badge">Recommended</span>' : (!r.viable ? '<span class="badge off">Not viable</span>' : '<span class="badge ghost">Option</span>')}
    <h3>${OPTION_LABEL[k]}</h3>
    <p class="note">${esc(r.note)}</p>
    <div class="row"><span>Revenue</span>${num(usd(r.revenue), revTip)}</div>
    <div class="row"><span>Costs</span>${num(usd(r.costs), costTip)}</div>
    <div class="row net"><span>Net profit</span>${num(usd(r.net), 'Revenue minus costs. The highest viable net profit is recommended.')}</div>
  </div>`;
}

function screenCompare() {
  const i = state.active;
  const it = state.items[i];
  const tabs = state.items.length > 1 ? `<div class="tabs" role="tablist">${state.items.map((x, j) =>
    `<button role="tab" aria-selected="${j === i}" class="${j === i ? 'on' : ''}" data-tab="${j}">${esc(x.name)}</button>`).join('')}</div>` : '';
  return `
    ${title('Compare the options', 'Each route is scored by net profit. Only the best one glows.')}
    ${tabs}
    <div class="card reason">
      <span class="label">Why ${OPTION_LABEL[it.decision.best].toLowerCase()}${it.reasonSource === 'bedrock' ? ' · written by Amazon Bedrock' : ''}</span>
      <p>${esc(it.reason)}</p>
      <div class="kv"><span>Saved versus scrapping</span>${num(usd(it.decision.savings), 'Net profit of the recommended route minus the net profit of scrapping.', 'accent')}</div>
    </div>
    <div class="grid four">${OPTIONS.map((k) => optionCard(it, k)).join('')}</div>
    <div class="actions"><button id="back">Back</button><button class="primary" id="next">Review and approve</button></div>`;
}

// ---------- 4. Approve ----------
function screenApprove() {
  const t = summarize(state.items, state.chosen);
  const rows = state.items.map((it, i) => {
    const sel = OPTIONS.filter((k) => it.decision.results[k].viable).map((k) =>
      `<option value="${k}" ${chosenKey(i) === k ? 'selected' : ''}>${OPTION_LABEL[k]}${k === it.decision.best ? ' (recommended)' : ''}</option>`).join('');
    const net = it.decision.results[chosenKey(i)].net;
    return `<tr>
      <td><div class="cell-item">${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : ''}<span>${esc(it.name)}</span></div></td>
      <td><label class="sr-only" for="route${i}">Route for ${esc(it.name)}</label><select id="route${i}" data-route="${i}">${sel}</select></td>
      <td class="r">${num(usd(net), 'Expected net profit for the selected route.')}</td>
    </tr>`;
  }).join('');
  return `
    ${title('Approve the plan', 'The AI recommendation is preselected. Change a route only if you need to.')}
    <div class="card table-card">
      <table>
        <thead><tr><th>Item</th><th>Route</th><th class="r">Net profit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><span class="label">Total net profit</span>${num(usd(t.net), 'Sum of net profit across all items with the selected routes.', 'big')}</div>
      <div class="card"><span class="label">Total saved versus scrapping</span>${num(usd(t.saved), 'How much more the plan earns than scrapping every item.', 'big accent')}</div>
    </div>
    <div class="error" role="alert">${esc(state.error)}</div>
    <div class="actions"><button id="back">Back</button><button class="primary" id="next" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Saving…' : 'Approve plan'}</button></div>`;
}

// ---------- 5. Result ----------
const NEXT = {
  resell: 'Clean, photograph and list as-is.',
  refurbish: 'Send to repair, quality check, list as refurbished.',
  donate: 'Pack and ship to the partner charity, file the receipt.',
  scrap: 'Remove batteries and data, send to the recycler.',
};
function screenResult() {
  const t = summarize(state.items, state.chosen);
  const list = state.items.map((it, i) => {
    const k = chosenKey(i);
    const r = it.decision.results[k];
    const saved = r.net - it.decision.results.scrap.net;
    return `<div class="card result-item ${k === it.decision.best ? '' : 'override'}">
      <div class="ri-head">
        ${imgsFor(it)[0] ? `<img src="${imgsFor(it)[0]}" alt="">` : ''}
        <div><h3>${esc(it.name)}</h3><span class="tag ${k === it.decision.best ? 'on' : ''}">${OPTION_LABEL[k]}</span>
          ${k !== it.decision.best ? `<span class="tag warn">Override of ${OPTION_LABEL[it.decision.best].toLowerCase()}</span>` : ''}</div>
      </div>
      <p>${esc(k === it.decision.best ? it.reason : `Manager picked ${OPTION_LABEL[k].toLowerCase()} instead of the recommended ${OPTION_LABEL[it.decision.best].toLowerCase()}.`)}</p>
      <div class="kv"><span>Net profit</span>${num(usd(r.net), 'Revenue minus costs for the approved route.')}</div>
      <div class="kv"><span>Saved versus scrapping</span>${num(usd(saved), 'Approved route net profit minus scrapping net profit.', 'accent')}</div>
      <p class="note">Next: ${NEXT[k]}</p>
    </div>`;
  }).join('');
  return `
    ${title('Recovery plan approved', {
      aws: 'Decisions are saved in DynamoDB. Here is what each item earns.',
      local: 'Here is what each item earns, assessed by Amazon Bedrock. Local mode does not save anything.',
      demo: 'Here is what each item earns. Demo mode does not save anything.',
    }[mode])}
    <div class="card hero">
      <div><span class="label">Total saved versus scrapping</span>${num(usd(t.saved), 'Extra money recovered compared with scrapping every item.', 'huge')}</div>
      <div><span class="label">Total net profit</span>${num(usd(t.net), 'Sum of net profit across all approved routes.', 'big')}</div>
      <div><span class="label">Items processed</span>${num(state.items.length, 'Products the AI identified in your photos.', 'big')}</div>
    </div>
    <div class="grid two" style="margin-top:16px">${list}</div>
    <p class="tagline">AWS enables scalable AI-powered inventory recovery.</p>
    <div class="actions"><span></span><button class="primary" id="again">Process more returns</button></div>`;
}

// ---------- Wiring ----------
const screens = [screenUpload, screenAssess, screenCompare, screenApprove, screenResult];

function render(focus = true) {
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
  if (focus) $app.focus({ preventScroll: true });
}

// Hash changes: switch view, or scroll to a home section (#problem, #how, #aws ...).
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
    // Decode in parallel, keep the original order.
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

function bind() {
  const $ = (id) => document.getElementById(id);
  $('back')?.addEventListener('click', () => go(state.step - 1));
  $('again')?.addEventListener('click', () => { state = fresh(); render(); });

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
  if (state.step === 2) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      state.active = Number(b.dataset.tab); render(false);
    }));
    $('next').addEventListener('click', () => go(3));
  }
  if (state.step === 3) {
    document.querySelectorAll('[data-route]').forEach((s) => s.addEventListener('change', () => {
      state.chosen[Number(s.dataset.route)] = s.value; render(false);
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
