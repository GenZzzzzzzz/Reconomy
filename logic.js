// Reconomy decision engine. Pure functions, shared by the browser and the deployable Lambda backend.
// Source of truth is this file. backend/src/decision.mjs is a copy made by scripts/sync-logic.sh.
// All money values are in USD. Rates can be replaced with the store's own numbers from S3 (applyRates).
//
// One objective for every route: NET RECOVERY VALUE (NRV), the money a route is expected to bring back.
//   NRV = expected sale revenue + fallback salvage - fees - fixed costs - repair - value lost while waiting
// Routes differ only in their cost profile (ROUTES below), so adding or tuning a route is a data change.
// A plan-level step then bundles low-value items into lots when sharing one listing and shipment pays off.

export const CATEGORIES = {
  //            share of new price on the used market | material value | disposal fee | value lost per week
  electronics: { label: 'Electronics', retention: 0.55, salvage: 0.08, disposal: 6, depreciation: 0.02 },
  apparel:     { label: 'Apparel', retention: 0.40, salvage: 0.02, disposal: 1, depreciation: 0.02 },
  furniture:   { label: 'Furniture', retention: 0.45, salvage: 0.05, disposal: 15, depreciation: 0.005 },
  appliances:  { label: 'Appliances', retention: 0.50, salvage: 0.10, disposal: 12, depreciation: 0.01 },
  toys:        { label: 'Toys & games', retention: 0.45, salvage: 0.02, disposal: 1, depreciation: 0.01 },
  other:       { label: 'Other', retention: 0.35, salvage: 0.03, disposal: 4, depreciation: 0.01 },
};

export const CONDITIONS = {
  A: { label: 'A · Like new', factor: 0.95 },
  B: { label: 'B · Good', factor: 0.80 },
  C: { label: 'C · Fair', factor: 0.55 },
  D: { label: 'D · Poor', factor: 0.25 },
};

export const DEFECTS = {
  cosmetic:   { label: 'Cosmetic damage', repair: 0.06 },
  functional: { label: 'Functional fault', repair: 0.18 },
  missing:    { label: 'Missing parts', repair: 0.10 },
  hygiene:    { label: 'Needs deep cleaning', repair: 0.03 },
};

// Cost profile of every route. sellThrough = share that actually sells; the rest falls back to recycling.
// days = time until the money comes in, which costs value at the category's weekly depreciation.
export const ROUTES = {
  resell:    { feeRate: 0.12, fixed: 5, days: 14, sellThrough: 0.90 },
  refurbish: { feeRate: 0.12, fixed: 10, days: 21, sellThrough: 0.95, valueFactor: 0.92 }, // fixed = bench labor: inspect, clean, test, repack
  // A small lot of similar items sells at a discount to the sum of single prices (lotFactor), with one listing.
  // Only low-value items qualify: those where one listing's handling would eat at least lowValueCostShare of their value.
  bundle:    { feeRate: 0.08, fixedPerLot: 7, perItem: 0.5, days: 7, sellThrough: 0.98, lotFactor: 0.75, minItems: 2, maxItems: 12, lowValueCostShare: 0.33 },
  donate:    { taxRate: 0.25, fixed: 3 },
  scrap:     {},
};

export const OPTIONS = ['resell', 'refurbish', 'bundle', 'donate', 'scrap'];
export const OPTION_LABEL = { resell: 'Resell', refurbish: 'Refurbish', bundle: 'Bundle', donate: 'Donate', scrap: 'Scrap' };
// Circularity, best first: reuse as-is, repair, reuse in bulk, repurpose by others, recycle materials.
export const CIRCULAR = { resell: 'Reuse', refurbish: 'Repair', bundle: 'Reuse in bulk', donate: 'Repurpose', scrap: 'Recycle' };
const CIRCULAR_RANK = { resell: 0, refurbish: 1, bundle: 2, donate: 3, scrap: 4 };

export let NO_PACKAGING_FACTOR = 0.92; // price penalty without original packaging
export let RATES_SOURCE = 'built-in defaults';
// Kept for older callers and tooltips.
export let FEE_RATE = ROUTES.resell.feeRate;
export let HANDLING = ROUTES.resell.fixed;
export let DONATE_TAX_RATE = ROUTES.donate.taxRate;

const round2 = (n) => Math.round(n * 100) / 100;
export const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
const pctTxt = (n) => `${Math.round(n * 100)}%`;

// Accepts a number only if it is finite and within [min, max]; otherwise keeps the current value.
const pick = (v, cur, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : cur);

// Applies business rates loaded from S3 (rates.json). Invalid or missing values keep their defaults.
export function applyRates(r, source = 'S3 rates.json') {
  if (!r || typeof r !== 'object') return;
  // Legacy flat fields still work.
  for (const k of ['resell', 'refurbish']) ROUTES[k].feeRate = pick(r.feeRate, ROUTES[k].feeRate, 0, 0.9);
  ROUTES.resell.fixed = pick(r.handling, ROUTES.resell.fixed, 0, 1000);
  ROUTES.donate.taxRate = pick(r.donateTaxRate, ROUTES.donate.taxRate, 0, 1);
  ROUTES.donate.fixed = pick(r.donateShipping, ROUTES.donate.fixed, 0, 1000);
  ROUTES.refurbish.valueFactor = pick(r.refurbValueFactor, ROUTES.refurbish.valueFactor, 0, 1.5);
  NO_PACKAGING_FACTOR = pick(r.noPackagingFactor, NO_PACKAGING_FACTOR, 0, 1);
  // Per-route cost profiles.
  const bounds = {
    feeRate: [0, 0.9], fixed: [0, 1000], fixedPerLot: [0, 5000], perItem: [0, 1000], days: [0, 365],
    sellThrough: [0, 1], valueFactor: [0, 1.5], lotFactor: [0, 1.5], taxRate: [0, 1], minItems: [2, 50], maxItems: [2, 200], lowValueCostShare: [0, 10],
  };
  for (const [k, route] of Object.entries(ROUTES)) {
    const n = r.routes?.[k];
    if (!n) continue;
    for (const f of Object.keys(route)) if (bounds[f]) route[f] = pick(n[f], route[f], ...bounds[f]);
  }
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const n = r.categories?.[k];
    if (!n) continue;
    c.retention = pick(n.retention, c.retention, 0, 1.5);
    c.salvage = pick(n.salvage, c.salvage, 0, 1);
    c.disposal = pick(n.disposal, c.disposal, 0, 10000);
    c.depreciation = pick(n.depreciation, c.depreciation, 0, 0.5);
  }
  for (const [k, c] of Object.entries(CONDITIONS)) c.factor = pick(r.conditions?.[k], c.factor, 0, 1.5);
  for (const [k, d] of Object.entries(DEFECTS)) d.repair = pick(r.defects?.[k], d.repair, 0, 2);
  FEE_RATE = ROUTES.resell.feeRate;
  HANDLING = ROUTES.resell.fixed;
  DONATE_TAX_RATE = ROUTES.donate.taxRate;
  RATES_SOURCE = r.version ? `${source} (${String(r.version).slice(0, 40)})` : source;
}

// ---------- Item input ----------
const clampPrice = (n) => Math.min(Math.max(n, 1), 20000);
const finite = (v) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v));

// Original price = the typical street price the AI reports, kept inside its own low-high range.
// Falls back to the older single estimatedOriginalPrice field (older AI responses).
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

// Price used for decisions. Catalog prices are trusted. AI estimates are shaded toward the low end
// of their own range as confidence drops, so an uncertain guess cannot push a risky route to the top.
export function valuationPrice(item) {
  const p = item.estimatedOriginalPrice;
  if (item.priceSource === 'catalog') return { price: p, haircut: 0 };
  const c = Number.isFinite(item.confidence) ? item.confidence : 0.5;
  const low = Number.isFinite(item.priceLow) && item.priceLow < p ? item.priceLow : p * 0.85;
  const price = round2(p - (1 - c) * (p - low));
  return { price, haircut: round2(p - price) };
}

// ---------- Route economics ----------
// Shared shape of every route result.
const result = (viable, revenue, costs, note, revNote, costNote, extra = {}) => ({
  viable, revenue: round2(revenue), costs: round2(costs), net: round2(revenue - costs), note, revNote, costNote, ...extra,
});

// Facts about one item that every route needs.
function itemFacts(item) {
  const cat = CATEGORIES[item.category];
  const { price, haircut } = valuationPrice(item);
  const packaging = item.hasPackaging ? 1 : NO_PACKAGING_FACTOR;
  const market = price * cat.retention;
  const asIs = market * CONDITIONS[item.condition].factor * packaging;
  const repairShare = item.defects.reduce((s, d) => s + DEFECTS[d].repair, 0);
  return {
    cat, price, haircut, packaging, market, asIs,
    repairCost: price * repairShare,
    working: !item.defects.includes('functional'),
    salvage: price * cat.salvage,
  };
}

// Expected outcome of putting goods worth `value` on sale through a route.
// Unsold goods fall back to recycling; waiting `days` costs value at the category's weekly depreciation.
function sale(value, route, f, extraFixed = 0) {
  const s = route.sellThrough;
  const holding = value * f.cat.depreciation * (route.days / 7);
  const revenue = s * value + (1 - s) * f.salvage;
  const fees = s * value * route.feeRate;
  const fallbackCost = (1 - s) * f.cat.disposal;
  return { revenue, fees, holding, fallbackCost, costs: fees + holding + fallbackCost + extraFixed };
}

export function evaluate(item) {
  const f = itemFacts(item);
  const R = ROUTES;

  const resellSale = sale(f.asIs, R.resell, f, R.resell.fixed);
  const refurbValue = f.market * R.refurbish.valueFactor * f.packaging;
  const refurbSale = sale(refurbValue, R.refurbish, f, R.refurbish.fixed + f.repairCost);
  const donateValue = f.asIs * R.donate.taxRate;

  const saleNote = (x, route) => `${pctTxt(route.sellThrough)} expected to sell; the rest is recycled. Fees ${usd(x.fees)}, value lost over ${route.days} days ${usd(x.holding)}.`;
  const results = {
    resell: f.working
      ? result(true, resellSale.revenue, resellSale.costs, 'Sell as-is at a used price.',
        `Used price ${usd(f.asIs)} × ${pctTxt(R.resell.sellThrough)} sell-through, plus recycling value for the rest.`,
        `${saleNote(resellSale, R.resell)} Handling ${usd(R.resell.fixed)}.`)
      : result(false, 0, 0, 'Cannot be sold as-is: it has a functional fault.', 'Not possible.', 'Not possible.'),
    refurbish: result(true, refurbSale.revenue, refurbSale.costs,
      f.repairCost > 0 ? 'Repair and clean, then sell as refurbished.' : 'Clean and certify, then sell as refurbished.',
      `Refurbished price ${usd(refurbValue)} × ${pctTxt(R.refurbish.sellThrough)} sell-through, plus recycling value for the rest.`,
      `Repair ${usd(f.repairCost)}. ${saleNote(refurbSale, R.refurbish)} Handling ${usd(R.refurbish.fixed)}.`),
    bundle: result(false, 0, 0, 'Needs other low-value items in the same category to form a lot.',
      'Sold together with other items as one lot.', 'One listing and one shipment shared by the lot.'),
    donate: f.working
      ? result(true, donateValue, R.donate.fixed, 'Donate to charity for a tax benefit.',
        `Tax benefit: fair value ${usd(f.asIs)} × ${pctTxt(R.donate.taxRate)}.`, `Shipping to the charity ${usd(R.donate.fixed)}.`)
      : result(false, 0, 0, 'Charities need working items.', 'Not possible.', 'Not possible.'),
    scrap: result(true, f.salvage, f.cat.disposal, 'Recycle for material value.',
      `Material value paid by the recycler (${pctTxt(f.cat.salvage)} of price).`, `Disposal fee for ${f.cat.label.toLowerCase()} ${usd(f.cat.disposal)}.`),
  };
  return rank({ results, facts: f });
}

// Picks the route with the highest net recovery value and notes a greener near-equal option.
function rank(ev) {
  const { results } = ev;
  const ranked = OPTIONS.filter((k) => results[k].viable).sort((a, b) => results[b].net - results[a].net || CIRCULAR_RANK[a] - CIRCULAR_RANK[b]);
  const best = ranked[0];
  const tol = Math.max(0.5, Math.abs(results[best].net) * 0.03);
  const greenerKey = ranked.find((k) => CIRCULAR_RANK[k] < CIRCULAR_RANK[best] && results[best].net - results[k].net <= tol);
  return {
    ...ev,
    ranked,
    best,
    runnerUp: ranked[1] || null,
    greener: greenerKey ? { route: greenerKey, gap: round2(results[best].net - results[greenerKey].net) } : null,
    savings: round2(results[best].net - results.scrap.net),
    market: round2(ev.facts.market),
    asIs: round2(ev.facts.asIs),
    repairCost: round2(ev.facts.repairCost),
    valuation: round2(ev.facts.price),
    haircut: ev.facts.haircut,
  };
}

// Decision for one item on its own (no bundling).
export function decide(item) {
  return evaluate(item);
}

// ---------- Bundling (plan level) ----------
// Net recovery value of selling a set of items as one lot.
function lotEconomics(members) {
  const R = ROUTES.bundle;
  let value = 0; let revenue = 0; let fees = 0; let holding = 0; let fallback = 0;
  for (const m of members) {
    const f = m.decision.facts;
    const v = f.asIs * R.lotFactor;
    const x = sale(v, R, f);
    value += v; revenue += x.revenue; fees += x.fees; holding += x.holding; fallback += x.fallbackCost;
  }
  const fixed = R.fixedPerLot + R.perItem * members.length;
  const costs = fees + holding + fallback + fixed;
  return { value, revenue, costs, net: revenue - costs, fees, holding, fixed };
}

const individualNet = (it) => it.decision.results[it.decision.individualBest].net;

// Finds the most valuable lot among bundle candidates: start from the lowest-value items, then remove any
// member that earns less in the lot than on its own route. Accept only if the lot beats selling separately.
function bestLot(cands) {
  const R = ROUTES.bundle;
  let lot = [...cands].sort((a, b) => individualNet(a) - individualNet(b)).slice(0, R.maxItems);
  for (;;) {
    if (lot.length < R.minItems) return null;
    const total = lotEconomics(lot).net;
    let worst = null; let worstMargin = 0;
    for (const m of lot) {
      const without = lot.filter((x) => x !== m);
      const withoutNet = without.length >= R.minItems ? lotEconomics(without).net : without.reduce((s, x) => s + individualNet(x), 0);
      const margin = total - withoutNet - individualNet(m); // what m adds to the lot beyond its own best route
      if (margin < worstMargin) { worst = m; worstMargin = margin; }
    }
    if (!worst) break;
    lot = lot.filter((x) => x !== worst);
  }
  const eco = lotEconomics(lot);
  const alone = lot.reduce((s, x) => s + individualNet(x), 0);
  return eco.net - alone > 0.5 ? { lot, eco, surplus: eco.net - alone } : null;
}

// Result of the bundle route for member m of a lot: its own best route plus a value-weighted share of the
// lot's surplus, so in the planned lot every member earns more than it would alone.
function shareResult(m, members, eco, lotId) {
  const wSum = members.reduce((s, x) => s + x.decision.facts.asIs, 0) || 1;
  const w = m.decision.facts.asIs / wSum;
  const surplus = eco.net - members.reduce((s, x) => s + individualNet(x), 0);
  const net = individualNet(m) + surplus * w;
  const revenue = eco.revenue * w;
  return result(true, revenue, revenue - net,
    `Sell in lot ${lotId} with ${members.length - 1} other ${CATEGORIES[m.category].label.toLowerCase()} item(s): one listing, one shipment.`,
    `Its share of the lot's sale: ${pctTxt(ROUTES.bundle.lotFactor)} of used value, ${pctTxt(ROUTES.bundle.sellThrough)} sell-through.`,
    `Its share of the lot's fees, value lost and shared fixed cost (${usd(eco.fixed)} for the whole lot).`,
    { lot: { id: lotId, size: members.length, items: members.map((x) => x.name) } });
}

function priceLot(members, lotId, targets = members) {
  const eco = lotEconomics(members);
  for (const m of targets) m.decision.results.bundle = shareResult(m, members, eco, lotId);
}

// Low value = a single listing's handling would eat a large share of what the item sells for. Defined by the cost
// profile, not a fixed dollar amount, so it adapts when a store changes its rates.
const isLowValue = (it) => it.decision.facts.working
  && ROUTES.resell.fixed >= ROUTES.bundle.lowValueCostShare * it.decision.facts.asIs;

// Full plan for all items: individual decisions, then bundling of low-value items per category.
export function planDecisions(items, { lotIds = 'ABCDEFGHIJ' } = {}) {
  const out = items.map((it) => {
    const d = decide(it);
    return { ...it, decision: { ...d, individualBest: d.best, lotHome: null } };
  });
  let next = 0;
  for (const cat of Object.keys(CATEGORIES)) {
    const cands = out.filter((it) => it.category === cat && isLowValue(it));
    const found = bestLot(cands);
    if (!found) continue;
    const id = lotIds[next] || String(next + 1);
    next += 1;
    for (const m of found.lot) m.decision.lotHome = id;
    priceLot(found.lot, id);
  }
  for (const it of out) Object.assign(it.decision, rank(it.decision));
  return out;
}

// Re-prices lots after a manager changes a route (changed = index of the item that changed).
// - Items set to Bundle form the lot; the others see what joining it would bring.
// - Choosing Bundle for a member of a lot that fell apart brings the whole lot back.
// - If fewer than the minimum stay, the lot is dissolved and the rest go back to their own best route.
export function replan(items, chosen, changed = -1) {
  const next = [...chosen];
  const homes = {};
  items.forEach((it, i) => { if (it.decision.lotHome) (homes[it.decision.lotHome] ||= []).push(i); });
  for (const [id, idx] of Object.entries(homes)) {
    let stay = idx.filter((i) => next[i] === 'bundle');
    if (idx.includes(changed) && next[changed] === 'bundle' && stay.length < ROUTES.bundle.minItems) {
      for (const i of idx) next[i] = 'bundle';
      stay = idx;
    }
    if (stay.length >= ROUTES.bundle.minItems) {
      const members = stay.map((i) => items[i]);
      priceLot(members, id);
      for (const i of idx.filter((x) => !stay.includes(x))) {
        priceLot([...members, items[i]], id, [items[i]]); // what rejoining would bring
      }
    } else {
      for (const i of stay) next[i] = items[i].decision.individualBest;
      const all = idx.map((i) => items[i]);
      priceLot(all, id); // value of re-forming the full lot
      for (const m of all) m.decision.results.bundle.note = `Re-forms lot ${id} with ${all.length - 1} other item(s).`;
    }
    for (const i of idx) Object.assign(items[i].decision, rank(items[i].decision));
  }
  return { items, chosen: next };
}

// ---------- Explanations and totals ----------
// Plain-language reason built from the numbers. Used as a fallback when the AI's own explanation fails.
export function buildReason(item, d) {
  const best = d.best;
  const r = d.results[best];
  const bits = [];
  const defectText = item.defects.length ? ` with ${item.defects.map((x) => DEFECTS[x].label.toLowerCase()).join(', ')}` : '';
  bits.push(`${item.name} looks like grade ${item.condition}${defectText}.`);
  if (!d.results.resell.viable) bits.push('It has a functional fault, so it cannot be sold or donated as-is.');
  if (best === 'bundle') bits.push(`Selling it in lot ${r.lot.id} with ${r.lot.size - 1} other item(s) spreads one listing and shipment across the lot.`);
  let line = `${OPTION_LABEL[best]} brings back the most at ${usd(r.net)} net`;
  if (d.runnerUp) line += `, ahead of ${OPTION_LABEL[d.runnerUp].toLowerCase()} at ${usd(d.results[d.runnerUp].net)}`;
  bits.push(`${line}.`);
  bits.push(best === 'scrap'
    ? 'Recycling is already the best return here.'
    : `That is ${usd(d.savings)} more than scrapping it (${usd(d.results.scrap.net)}).`);
  if (d.greener) bits.push(`${OPTION_LABEL[d.greener.route]} is a greener option for only ${usd(d.greener.gap)} less.`);
  return bits.join(' ');
}

// Totals across items. chosen[i] is the route picked for item i (defaults to the recommendation).
export function summarize(items, chosen = []) {
  let net = 0; let saved = 0; let diverted = 0;
  items.forEach((it, i) => {
    const key = chosen[i] && it.decision.results[chosen[i]]?.viable ? chosen[i] : it.decision.best;
    net += it.decision.results[key].net;
    saved += it.decision.results[key].net - it.decision.results.scrap.net;
    if (key !== 'scrap') diverted += 1;
  });
  return { net: round2(net), saved: round2(saved), diverted };
}
