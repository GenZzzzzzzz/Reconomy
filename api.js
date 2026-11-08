import { normalizeItem, planDecisions, buildReason, applyRates, resetRates, applyCatalogMatch, OPTIONS } from './logic.js';
import { API_BASE } from './config.js';

export const MAX_IMAGES = 8;

// 'aws'     : deployed Lambda backend (config.js API_BASE)
// 'local'   : local Python server calling Amazon Bedrock (server/app.py)
// 'offline' : no AI reachable. Nothing is analyzed; there are no simulated results.
export let mode = 'offline';
export let modelId = '';

export const OFFLINE_MESSAGE = "The AI isn't connected. Start the server with .venv/bin/python server/app.py in the Reconomy folder, then open http://localhost:8000.";

export async function detectMode() {
  mode = 'offline';
  if (API_BASE) { mode = 'aws'; return mode; }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const body = res.ok ? await res.json().catch(() => null) : null;
    if (body?.ok) { mode = 'local'; modelId = body.model || ''; }
  } catch { /* no AI server reachable */ }
  return mode;
}

async function postJson(url, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    if (!API_BASE) mode = 'offline';
    throw new Error(OFFLINE_MESSAGE);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error (${res.status}).`);
  return body;
}

// Local Bedrock flow: AI inspects photos, logic.js computes the money, AI explains the result.
async function localAnalyze(dataUrls) {
  const { items: raw, catalog } = await postJson('/api/analyze', { images: dataUrls.map((u) => u.split(',')[1]) });
  // Rates are reset for every analysis. A failed catalog lookup cannot reuse the previous item's rates.
  if (catalog?.ok) applyRates(catalog.rates);
  else resetRates();
  const items = planDecisions(raw
    .map((r) => normalizeItem(r, dataUrls.length))
    .map((it, i) => applyCatalogMatch(it, catalog?.ok ? catalog.matches[i] : null)));
  const catalogInfo = catalog?.ok
    ? { ok: true, function: catalog.function, size: catalog.catalogSize, version: catalog.catalogVersion }
    : { ok: false, error: catalog?.error || 'Catalog lookup unavailable.' };
  if (!items.length) return { mode: 'local', id: null, items, catalog: catalogInfo };
  const facts = items.map((it, i) => ({
    index: i, name: it.name, category: it.category, condition: it.condition, defects: it.defects,
    priceSource: it.priceSource === 'catalog' ? `store catalog (${it.sku})` : 'AI estimate',
    originalPrice: it.estimatedOriginalPrice,
    identityConfidence: it.identityConfidence,
    conditionConfidence: it.conditionConfidence,
    priceConfidence: it.priceConfidence,
    assessmentNeedsReview: it.decision.needsReview,
    reviewReasons: it.decision.reviewReasons,
    recommended: it.decision.best, savedVersusScrap: it.decision.savings,
    netRecoveryValueByOption: Object.fromEntries(it.decision.ranked.map((k) => [k, it.decision.results[k].net])),
    notViable: OPTIONS.filter((k) => !it.decision.results[k].viable),
    bundle: it.decision.best === 'bundle' ? { lot: it.decision.results.bundle.lot.id, itemsInLot: it.decision.results.bundle.lot.size, key: it.decision.results.bundle.lot.key } : null,
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

// Real AI analysis only. If no AI is reachable, this throws instead of inventing results.
export async function analyze(dataUrls) {
  if (mode === 'offline') await detectMode(); // picks up a server started after the page loaded
  if (mode === 'aws') {
    const body = await postJson(`${API_BASE}/analyze`, { images: dataUrls.map((u) => u.split(',')[1]) });
    return { mode: 'aws', ...body };
  }
  if (mode === 'local') return localAnalyze(dataUrls);
  throw new Error(OFFLINE_MESSAGE);
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
