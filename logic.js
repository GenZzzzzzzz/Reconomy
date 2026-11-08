// Pure decision logic, shared by the browser and the deployable Lambda backend.
// Rates can be replaced at runtime with the store's real numbers from Amazon S3 (applyRates).
// Source of truth is this file. backend/src/decision.mjs is a copy made by scripts/sync-logic.sh.
// All money values are in USD.

export const CATEGORIES = {
  electronics: { label: 'Electronics', retention: 0.55, salvage: 0.08, disposal: 6 },
  apparel:     { label: 'Apparel',     retention: 0.40, salvage: 0.02, disposal: 1 },
  furniture:   { label: 'Furniture',   retention: 0.45, salvage: 0.05, disposal: 15 },
  appliances:  { label: 'Appliances',  retention: 0.50, salvage: 0.10, disposal: 12 },
  toys:        { label: 'Toys & games', retention: 0.45, salvage: 0.02, disposal: 1 },
  other:       { label: 'Other',       retention: 0.35, salvage: 0.03, disposal: 4 },
};

export const CONDITIONS = {
  A: { label: 'A · Like new', factor: 0.95 },
  B: { label: 'B · Good',     factor: 0.80 },
  C: { label: 'C · Fair',     factor: 0.55 },
  D: { label: 'D · Poor',     factor: 0.25 },
};

export const DEFECTS = {
  cosmetic:   { label: 'Cosmetic damage',     repair: 0.06 },
  functional: { label: 'Functional fault',    repair: 0.18 },
  missing:    { label: 'Missing parts',       repair: 0.10 },
  hygiene:    { label: 'Needs deep cleaning', repair: 0.03 },
};

export const OPTIONS = ['resell', 'refurbish', 'donate', 'scrap'];
export const OPTION_LABEL = { resell: 'Resell', refurbish: 'Refurbish', donate: 'Donate', scrap: 'Scrap' };

// Defaults. Overridden at runtime by data/rates.json from Amazon S3 (see applyRates).
export let FEE_RATE = 0.12;        // marketplace + payment fees on resale
export let HANDLING = 5;           // labor to list and ship
export let DONATE_TAX_RATE = 0.25; // tax benefit as a share of fair value
export let DONATE_SHIPPING = 3;
export let REFURB_VALUE_FACTOR = 0.92; // refurbished price as a share of the used-market value
export let NO_PACKAGING_FACTOR = 0.92; // price penalty without original packaging
export let RATES_SOURCE = 'built-in defaults';

const round2 = (n) => Math.round(n * 100) / 100;

// Accepts a number only if it is finite and within [min, max]; otherwise keeps the current value.
const pick = (v, cur, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : cur);

// Applies business rates loaded from S3 (rates.json). Invalid or missing values keep their defaults.
export function applyRates(r, source = 'S3 rates.json') {
  if (!r || typeof r !== 'object') return;
  FEE_RATE = pick(r.feeRate, FEE_RATE, 0, 0.9);
  HANDLING = pick(r.handling, HANDLING, 0, 1000);
  DONATE_TAX_RATE = pick(r.donateTaxRate, DONATE_TAX_RATE, 0, 1);
  DONATE_SHIPPING = pick(r.donateShipping, DONATE_SHIPPING, 0, 1000);
  REFURB_VALUE_FACTOR = pick(r.refurbValueFactor, REFURB_VALUE_FACTOR, 0, 1.5);
  NO_PACKAGING_FACTOR = pick(r.noPackagingFactor, NO_PACKAGING_FACTOR, 0, 1);
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const n = r.categories?.[k];
    if (!n) continue;
    c.retention = pick(n.retention, c.retention, 0, 1.5);
    c.salvage = pick(n.salvage, c.salvage, 0, 1);
    c.disposal = pick(n.disposal, c.disposal, 0, 10000);
  }
  for (const [k, c] of Object.entries(CONDITIONS)) c.factor = pick(r.conditions?.[k], c.factor, 0, 1.5);
  for (const [k, d] of Object.entries(DEFECTS)) d.repair = pick(r.defects?.[k], d.repair, 0, 2);
  RATES_SOURCE = r.version ? `${source} (${String(r.version).slice(0, 40)})` : source;
}
export const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);

const clampPrice = (n) => Math.min(Math.max(n, 1), 20000);
const finite = (v) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v));

// Original price = the typical street price the AI reports, kept inside its own low-high range.
// Falls back to the older single estimatedOriginalPrice field (demo mode, old responses).
function streetPrice(r) {
  let low = finite(r.priceLow) ? clampPrice(Number(r.priceLow)) : null;
  let high = finite(r.priceHigh) ? clampPrice(Number(r.priceHigh)) : null;
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  let price = finite(r.priceTypical) ? Number(r.priceTypical)
    : low !== null && high !== null ? (low + high) / 2
    : finite(r.estimatedOriginalPrice) ? Number(r.estimatedOriginalPrice) : 30;
  price = clampPrice(price);
  if (low !== null) price = Math.max(price, low);
  if (high !== null) price = Math.min(price, high);
  return { price: Math.round(price * 100) / 100, low, high };
}

// Cleans one item coming from the AI model so bad output cannot break the math.
export function normalizeItem(raw, imageCount = 1) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const conf = Number(r.confidence);
  const p = streetPrice(r);
  const idx = Array.isArray(r.imageIndexes)
    ? [...new Set(r.imageIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < imageCount))]
    : [];
  return {
    name: String(r.name || 'Unidentified item').slice(0, 80),
    category: CATEGORIES[r.category] ? r.category : 'other',
    estimatedOriginalPrice: p.price,
    priceLow: p.low,
    priceHigh: p.high,
    priceBasis: String(r.priceBasis || '').slice(0, 200),
    condition: CONDITIONS[r.condition] ? r.condition : 'C',
    defects: Array.isArray(r.defects) ? [...new Set(r.defects.filter((d) => DEFECTS[d]))] : [],
    hasPackaging: r.hasPackaging === true,
    confidence: Number.isFinite(conf) ? Math.min(Math.max(conf, 0), 1) : 0.5,
    notes: String(r.notes || '').slice(0, 200),
    imageIndexes: idx.length ? idx : [0],
  };
}

// Uses the real retail price from the S3 catalog (matched by Lambda) instead of the AI's estimate.
export function applyCatalogMatch(item, match) {
  const out = { ...item, aiEstimatedPrice: item.estimatedOriginalPrice, priceSource: 'ai', sku: null, catalogName: null };
  const price = Number(match?.retailPrice);
  if (match?.sku && Number.isFinite(price) && price > 0 && price <= 100000) {
    out.estimatedOriginalPrice = price;
    out.priceSource = 'catalog';
    out.sku = String(match.sku).slice(0, 40);
    out.catalogName = String(match.name || '').slice(0, 80);
  } else {
    out.matchNote = String(match?.reason || 'No catalog match.').slice(0, 160);
  }
  return out;
}

export function evaluate({ price, category, condition, defects = [], hasPackaging = true }) {
  const cat = CATEGORIES[category];
  const cond = CONDITIONS[condition];
  const market = price * cat.retention;
  const packaging = hasPackaging ? 1 : NO_PACKAGING_FACTOR;
  const asIs = market * cond.factor * packaging;
  const repairCost = price * defects.reduce((s, d) => s + DEFECTS[d].repair, 0);
  const functionalFault = defects.includes('functional');
  const refurbished = market * REFURB_VALUE_FACTOR * packaging;

  const resellRevenue = functionalFault ? 0 : asIs;
  const resellFees = resellRevenue * FEE_RATE;
  const resellHandling = functionalFault ? 0 : HANDLING;
  const refFees = refurbished * FEE_RATE;
  const donateValue = functionalFault ? 0 : asIs * DONATE_TAX_RATE;

  const results = {
    resell: {
      revenue: resellRevenue, costs: resellFees + resellHandling,
      net: resellRevenue - resellFees - resellHandling, viable: !functionalFault,
      note: functionalFault ? 'Not sellable as-is: has a functional fault.' : 'List as-is at a discounted used price.',
    },
    refurbish: {
      revenue: refurbished, costs: repairCost + refFees + HANDLING,
      net: refurbished - repairCost - refFees - HANDLING, viable: true,
      note: repairCost > 0 ? 'Repair, clean, then sell as refurbished.' : 'Clean and certify, then sell as refurbished.',
    },
    donate: {
      revenue: donateValue, costs: DONATE_SHIPPING,
      net: donateValue - DONATE_SHIPPING, viable: !functionalFault,
      note: 'Tax benefit from a charity donation, plus goodwill.',
    },
    scrap: {
      revenue: price * cat.salvage, costs: cat.disposal,
      net: price * cat.salvage - cat.disposal, viable: true,
      note: 'Recycle for material value, minus disposal fees.',
    },
  };
  for (const k of OPTIONS) for (const f of ['revenue', 'costs', 'net']) results[k][f] = round2(results[k][f]);

  const ranked = OPTIONS.filter((k) => results[k].viable).sort((a, b) => results[b].net - results[a].net);
  return { results, ranked, best: ranked[0], market: round2(market), asIs: round2(asIs), repairCost: round2(repairCost) };
}

// Full decision for one AI-identified item. "savings" is measured against scrapping it.
export function decide(item) {
  const ev = evaluate({
    price: item.estimatedOriginalPrice, category: item.category,
    condition: item.condition, defects: item.defects, hasPackaging: item.hasPackaging,
  });
  const savings = round2(ev.results[ev.best].net - ev.results.scrap.net);
  return { ...ev, savings, runnerUp: ev.ranked[1] || null };
}

// Plain-language reason built from the numbers. Used directly in demo mode and as a fallback
// if the model's own explanation fails.
export function buildReason(item, d) {
  const best = d.best;
  const r = d.results[best];
  const bits = [];
  const defectText = item.defects.length ? ` with ${item.defects.map((x) => DEFECTS[x].label.toLowerCase()).join(', ')}` : '';
  bits.push(`${item.name} looks like grade ${item.condition}${defectText}.`);
  if (!d.results.resell.viable) bits.push('It has a functional fault, so it cannot be sold or donated as-is.');
  let line = `${OPTION_LABEL[best]} earns the most at ${usd(r.net)} net`;
  if (d.runnerUp) line += `, ahead of ${OPTION_LABEL[d.runnerUp].toLowerCase()} at ${usd(d.results[d.runnerUp].net)}`;
  line += '.';
  bits.push(line);
  bits.push(best === 'scrap'
    ? 'Scrapping is already the best return here, so there is nothing extra to recover.'
    : `That saves ${usd(d.savings)} compared with scrapping it (${usd(d.results.scrap.net)}).`);
  return bits.join(' ');
}

// Totals across items. chosen[i] is the route picked for item i (defaults to the recommendation).
export function summarize(items, chosen = []) {
  let net = 0; let saved = 0;
  items.forEach((it, i) => {
    const key = chosen[i] && it.decision.results[chosen[i]]?.viable ? chosen[i] : it.decision.best;
    net += it.decision.results[key].net;
    saved += it.decision.results[key].net - it.decision.results.scrap.net;
  });
  return { net: round2(net), saved: round2(saved) };
}
