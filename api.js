import { normalizeItem, planDecisions, buildReason, applyRates, applyCatalogMatch, OPTIONS } from './logic.js';
import { API_BASE } from './config.js';

export const MAX_IMAGES = 8;

// 'aws'   : deployed Lambda backend (config.js API_BASE)
// 'local' : local Python server calling Amazon Bedrock (server/app.py)
// 'demo'  : no backend, AI simulated in the browser
export let mode = 'demo';
export let modelId = '';

export async function detectMode() {
  if (API_BASE) { mode = 'aws'; return mode; }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const body = res.ok ? await res.json() : null;
    if (body?.ok) { mode = 'local'; modelId = body.model || ''; }
  } catch { /* static server: stay in demo */ }
  return mode;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error (${res.status}).`);
  return body;
}

// Local Bedrock flow: AI inspects photos, logic.js computes the money, AI explains the result.
async function localAnalyze(dataUrls) {
  const { items: raw, catalog } = await postJson('/api/analyze', { images: dataUrls.map((u) => u.split(',')[1]) });
  // Store's real rates and catalog prices come from S3 via the reconomy-catalog Lambda.
  if (catalog?.ok) applyRates(catalog.rates);
  const items = planDecisions(raw
    .map((r) => normalizeItem(r, dataUrls.length))
    .map((it, i) => applyCatalogMatch(it, catalog?.ok ? catalog.matches[i] : null)));
  const catalogInfo = catalog?.ok
    ? { ok: true, function: catalog.function, size: catalog.catalogSize, version: catalog.catalogVersion }
    : { ok: false, error: catalog?.error || 'Catalog lookup unavailable.' };
  if (!items.length) return { mode: 'local', id: null, items, catalog: catalogInfo };
  const facts = items.map((it, i) => ({
    index: i, name: it.name, condition: it.condition, defects: it.defects,
    priceSource: it.priceSource === 'catalog' ? `store catalog (${it.sku})` : 'AI estimate',
    originalPrice: it.estimatedOriginalPrice,
    recommended: it.decision.best, savedVersusScrap: it.decision.savings,
    netRecoveryValueByOption: Object.fromEntries(it.decision.ranked.map((k) => [k, it.decision.results[k].net])),
    notViable: OPTIONS.filter((k) => !it.decision.results[k].viable),
    bundle: it.decision.best === 'bundle' ? { lot: it.decision.results.bundle.lot.id, itemsInLot: it.decision.results.bundle.lot.size } : null,
    greenerOption: it.decision.greener ? { route: it.decision.greener.route, costsLess: it.decision.greener.gap } : null,
  }));
  let reasons = null;
  try { reasons = (await postJson('/api/explain', { facts })).reasons; } catch { /* fall back to rules */ }
  items.forEach((it, i) => {
    const t = reasons?.[i];
    const ok = typeof t === 'string' && t.trim();
    it.reason = ok ? t.trim() : buildReason(it, it.decision);
    it.reasonSource = ok ? 'bedrock' : 'rules';
  });
  return { mode: 'local', id: null, items, catalog: catalogInfo };
}

// Shrinks a photo to max 1024px JPEG so the upload stays small and the model gets a uniform format.
const HEIC = /\.(heic|heif)$/i;
const readB64 = (blob) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(blob);
});

export async function resizeImage(file) {
  if (!file.type.startsWith('image/') && !HEIC.test(file.name)) throw new Error(`${file.name} is not an image.`);
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    // Chrome/Firefox cannot decode HEIC (iPhone photos). Let the local server convert it to JPEG.
    if (mode !== 'local') throw new Error(`${file.name} could not be read. Try a JPG or PNG.`);
    let jpg;
    try {
      jpg = (await postJson('/api/convert', { image: await readB64(file) })).image;
    } catch (e) {
      throw new Error(`${file.name}: ${e.message}`);
    }
    const bytes = Uint8Array.from(atob(jpg), (c) => c.charCodeAt(0));
    bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  }
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export async function analyze(dataUrls) {
  if (mode === 'aws') {
    const body = await postJson(`${API_BASE}/analyze`, { images: dataUrls.map((u) => u.split(',')[1]) });
    return { mode: 'aws', ...body };
  }
  if (mode === 'local') return localAnalyze(dataUrls);
  return mockAnalyze(dataUrls);
}

export async function approve(id, choices) {
  if (mode !== 'aws') return;
  const res = await fetch(`${API_BASE}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, choices }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server error (${res.status}).`);
}

// ---- Demo mode: simulated "AI". Results are NOT real image recognition. ----
const CATALOG = [
  { name: 'Wireless headphones', category: 'electronics', price: 129 },
  { name: 'Running sneakers', category: 'apparel', price: 95 },
  { name: 'Office chair', category: 'furniture', price: 220 },
  { name: 'Espresso machine', category: 'appliances', price: 180 },
  { name: 'Building block set', category: 'toys', price: 60 },
  { name: 'Bluetooth speaker', category: 'electronics', price: 80 },
  { name: 'Denim jacket', category: 'apparel', price: 70 },
];
const DEFECT_SETS = [[], ['cosmetic'], ['cosmetic', 'hygiene'], ['functional'], ['missing']];

function hash(s) {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(s.length / 2000));
  for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function mockAnalyze(dataUrls) {
  await new Promise((r) => setTimeout(r, 4800));
  const raw = dataUrls.map((u, i) => {
    const h = hash(u);
    const p = CATALOG[h % CATALOG.length];
    const item = normalizeItem({
      name: p.name, category: p.category, estimatedOriginalPrice: p.price,
      condition: 'ABBCD'[(h >> 3) % 5], defects: DEFECT_SETS[(h >> 7) % DEFECT_SETS.length],
      hasPackaging: (h >> 13) % 2 === 0, confidence: 0.7 + ((h >> 11) % 25) / 100,
      notes: 'Simulated result (demo mode).', imageIndexes: [i],
    }, dataUrls.length);
    return applyCatalogMatch(item, null);
  });
  const items = planDecisions(raw).map((it) => ({ ...it, reason: buildReason(it, it.decision) }));
  return { mode: 'demo', id: null, items };
}
