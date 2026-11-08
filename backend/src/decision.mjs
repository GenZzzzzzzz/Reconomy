// Reconomy decision engine.
// One shared, explainable measure for every route:
//   conservative recovery = expected money back - all route costs - wait-time value loss.
//
// The engine uses evidence before economics:
//   1. Prefer a verified catalog price.
//   2. Otherwise use the low side of the AI market-price range when evidence is weak.
//   3. Only bundle compatible, low-value items when a shared lot beats selling them separately.
//   4. Flag weak evidence and near-ties for a manager to check.
//
// Source of truth is this file. scripts/sync-logic.sh copies it to backend/src/decision.mjs.

export const CATEGORIES = {
  //            used-market share of a new reference | salvage | disposal | loss of market value per week
  electronics: { label: 'Electronics', retention: 0.55, salvage: 0.08, disposal: 6, depreciation: 0.02 },
  apparel:     { label: 'Apparel', retention: 0.40, salvage: 0.02, disposal: 1, depreciation: 0.02 },
  furniture:   { label: 'Furniture', retention: 0.45, salvage: 0.05, disposal: 15, depreciation: 0.005 },
  appliances:  { label: 'Appliances', retention: 0.50, salvage: 0.10, disposal: 12, depreciation: 0.01 },
  toys:        { label: 'Toys & games', retention: 0.45, salvage: 0.02, disposal: 1, depreciation: 0.01 },
  other:       { label: 'Other', retention: 0.35, salvage: 0.03, disposal: 4, depreciation: 0.01 },
};

export const CONDITIONS = {
  A: { label: 'A · Like new', factor: 0.95, sellability: 1.00 },
  B: { label: 'B · Good', factor: 0.80, sellability: 0.94 },
  C: { label: 'C · Fair', factor: 0.55, sellability: 0.78 },
  D: { label: 'D · Poor', factor: 0.25, sellability: 0.58 },
};

export const DEFECTS = {
  cosmetic:   { label: 'Cosmetic damage', repair: 0.06, sellability: 0.95 },
  functional: { label: 'Functional fault', repair: 0.18, sellability: 0.00 },
  missing:    { label: 'Missing parts', repair: 0.10, sellability: 0.80 },
  hygiene:    { label: 'Needs deep cleaning', repair: 0.03, sellability: 0.88 },
};

// Each route has a data-only cost profile. Rates can be overridden through data/rates.json in S3.
export const ROUTES = {
  resell:    { feeRate: 0.12, fixed: 5, days: 14, sellThrough: 0.90 },
  refurbish: { feeRate: 0.12, fixed: 10, days: 21, sellThrough: 0.95, valueFactor: 0.92 },
  // A compatible small lot: one listing and shipment shared across low-value items.
  bundle:    { feeRate: 0.08, fixedPerLot: 7, perItem: 0.5, days: 7, sellThrough: 0.98, lotFactor: 0.75, minItems: 2, maxItems: 12, lowValueCostShare: 0.33 },
  donate:    { taxRate: 0.25, fixed: 3 },
  scrap:     {},
};

export const OPTIONS = ['resell', 'refurbish', 'bundle', 'donate', 'scrap'];
export const OPTION_LABEL = { resell: 'Resell', refurbish: 'Refurbish', bundle: 'Bundle', donate: 'Donate', scrap: 'Scrap' };
export const CIRCULAR = { resell: 'Reuse', refurbish: 'Repair', bundle: 'Reuse in bulk', donate: 'Repurpose', scrap: 'Recycle' };
const CIRCULAR_RANK = { resell: 0, refurbish: 1, bundle: 2, donate: 3, scrap: 4 };

export let NO_PACKAGING_FACTOR = 0.92;
export let RATES_SOURCE = 'built-in defaults';
// Compatibility exports used by existing UI/tooltips.
export let FEE_RATE = ROUTES.resell.feeRate;
export let HANDLING = ROUTES.resell.fixed;
export let DONATE_TAX_RATE = ROUTES.donate.taxRate;

const DEFAULTS = JSON.parse(JSON.stringify({ CATEGORIES, CONDITIONS, DEFECTS, ROUTES, noPackagingFactor: NO_PACKAGING_FACTOR }));
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const validNumber = (v) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v));
const confidence = (v, fallback = 0.5) => validNumber(v) ? clamp(Number(v), 0, 1) : fallback;
export const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
const pct = (n) => `${Math.round(n * 100)}%`;

function restore(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, JSON.parse(JSON.stringify(source)));
}

// Reset rates for a new analysis, preventing one catalog lookup from affecting the next analysis.
export function resetRates() {
  restore(CATEGORIES, DEFAULTS.CATEGORIES);
  restore(CONDITIONS, DEFAULTS.CONDITIONS);
  restore(DEFECTS, DEFAULTS.DEFECTS);
  restore(ROUTES, DEFAULTS.ROUTES);
  NO_PACKAGING_FACTOR = DEFAULTS.noPackagingFactor;
  RATES_SOURCE = 'built-in defaults';
  FEE_RATE = ROUTES.resell.feeRate;
  HANDLING = ROUTES.resell.fixed;
  DONATE_TAX_RATE = ROUTES.donate.taxRate;
}

const choose = (v, old, min, max) => validNumber(v) && Number(v) >= min && Number(v) <= max ? Number(v) : old;

// Apply one analysis's S3 rates. Invalid values are ignored, and every call starts from defaults.
export function applyRates(raw, source = 'S3 rates.json') {
  resetRates();
  if (!raw || typeof raw !== 'object') return;
  // Legacy flat fields remain supported.
  ROUTES.resell.feeRate = choose(raw.feeRate, ROUTES.resell.feeRate, 0, 0.9);
  ROUTES.refurbish.feeRate = choose(raw.feeRate, ROUTES.refurbish.feeRate, 0, 0.9);
  ROUTES.resell.fixed = choose(raw.handling, ROUTES.resell.fixed, 0, 1000);
  ROUTES.donate.taxRate = choose(raw.donateTaxRate, ROUTES.donate.taxRate, 0, 1);
  ROUTES.donate.fixed = choose(raw.donateShipping, ROUTES.donate.fixed, 0, 1000);
  ROUTES.refurbish.valueFactor = choose(raw.refurbValueFactor, ROUTES.refurbish.valueFactor, 0, 1.5);
  NO_PACKAGING_FACTOR = choose(raw.noPackagingFactor, NO_PACKAGING_FACTOR, 0, 1);

  const limits = {
    feeRate: [0, 0.9], fixed: [0, 1000], fixedPerLot: [0, 5000], perItem: [0, 1000], days: [0, 365],
    sellThrough: [0, 1], valueFactor: [0, 1.5], lotFactor: [0, 1.5], taxRate: [0, 1],
    minItems: [2, 50], maxItems: [2, 200], lowValueCostShare: [0, 10], repairSuccess: [0, 1],
  };
  for (const [key, route] of Object.entries(ROUTES)) {
    const update = raw.routes?.[key];
    if (!update || typeof update !== 'object') continue;
    for (const [field, bounds] of Object.entries(limits)) {
      if (field in route) route[field] = choose(update[field], route[field], ...bounds);
    }
  }
  for (const [key, category] of Object.entries(CATEGORIES)) {
    const update = raw.categories?.[key];
    if (!update || typeof update !== 'object') continue;
    category.retention = choose(update.retention, category.retention, 0, 1.5);
    category.salvage = choose(update.salvage, category.salvage, 0, 1);
    category.disposal = choose(update.disposal, category.disposal, 0, 10000);
    category.depreciation = choose(update.depreciation, category.depreciation, 0, 0.5);
  }
  for (const [key, condition] of Object.entries(CONDITIONS)) {
    const update = raw.conditions?.[key];
    condition.factor = choose(update, condition.factor, 0, 1.5);
  }
  for (const [key, defect] of Object.entries(DEFECTS)) {
    const update = raw.defects?.[key];
    defect.repair = choose(update, defect.repair, 0, 2);
  }
  FEE_RATE = ROUTES.resell.feeRate;
  HANDLING = ROUTES.resell.fixed;
  DONATE_TAX_RATE = ROUTES.donate.taxRate;
  RATES_SOURCE = raw.version ? `${source} (${String(raw.version).slice(0, 40)})` : source;
}

// ---------- Evidence and price input ----------
const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanKey = (v) => clean(v, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const PRICE_TYPES = new Set(['new_street', 'current_market', 'renewed_market', 'unknown']);
const EVIDENCE_FILLER = new Set(['the', 'and', 'with', 'model', 'edition', 'version', 'generation']);

function words(value) {
  return clean(value).toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Exact model claims need visible support. A logo can support a brand, but a model name must be
// substantially present in observed text rather than inferred from an item's silhouette.
function supportedByEvidence(value, observedText, required = 1) {
  const evidence = new Set(words(observedText.join(' ')));
  const terms = [...new Set(words(value).filter((word) => !EVIDENCE_FILLER.has(word)))];
  if (!terms.length) return false;
  return terms.filter((word) => evidence.has(word)).length / terms.length >= required;
}

function normalizeStreetPrice(raw) {
  let low = validNumber(raw.priceLow) ? clamp(Number(raw.priceLow), 1, 20000) : null;
  let high = validNumber(raw.priceHigh) ? clamp(Number(raw.priceHigh), 1, 20000) : null;
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  let typical = validNumber(raw.priceTypical) ? Number(raw.priceTypical)
    : low !== null && high !== null ? (low + high) / 2
    : validNumber(raw.estimatedOriginalPrice) ? Number(raw.estimatedOriginalPrice) : 30;
  typical = clamp(typical, 1, 20000);
  if (low !== null) typical = Math.max(typical, low);
  if (high !== null) typical = Math.min(typical, high);
  return { typical: round2(typical), low, high };
}

function normalizeRepairability(raw, hasFunctionalFault) {
  if (!hasFunctionalFault) return 1;
  if (validNumber(raw.repairability)) return confidence(raw.repairability);
  const value = String(raw.repairability || '').toLowerCase();
  if (value === 'repairable') return 0.8;
  if (value === 'not_repairable') return 0;
  return 0.6; // unknown fault: retain recovery potential, but price its risk in.
}

// Validate Bedrock output at the trust boundary. Identity, condition and price confidence are separate
// because a clear photo may prove condition without proving the exact model or current market price.
export function normalizeItem(raw, imageCount = 1) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const p = normalizeStreetPrice(r);
  const observedText = Array.isArray(r.observedText)
    ? r.observedText.map((x) => clean(x, 80)).filter((text) => text && !/^(no visible|no apparent|no defects?)/i.test(text)).slice(0, 6)
    : [];
  const productType = clean(r.productType, 80) || clean(r.name, 80) || 'Unidentified item';
  const claimedBrand = clean(r.brand, 60);
  const claimedModel = clean(r.model, 80);
  const brandSupported = !claimedBrand || supportedByEvidence(claimedBrand, observedText, 1);
  const modelSupported = !claimedModel || supportedByEvidence(claimedModel, observedText, 0.60);
  let identityConfidence = confidence(r.identityConfidence ?? r.confidence);
  if (claimedBrand && !brandSupported) identityConfidence = Math.min(identityConfidence, 0.55);
  if (claimedModel && !modelSupported) identityConfidence = Math.min(identityConfidence, 0.55);
  const brand = brandSupported ? claimedBrand || null : null;
  const model = brandSupported && modelSupported ? claimedModel || null : null;
  // Do not show an unproven exact model in the UI. Product type remains useful and honest.
  const name = (claimedBrand !== brand || claimedModel !== model) && productType
    ? clean(`${brand ? `${brand} ` : ''}${productType}`, 80)
    : clean(r.name || `${brand ? `${brand} ` : ''}${productType}`, 80);
  const conditionConfidence = confidence(r.conditionConfidence, identityConfidence);
  const priceConfidence = Math.min(confidence(r.priceConfidence, identityConfidence), identityConfidence);
  const condition = CONDITIONS[r.condition] ? r.condition : 'C';
  const defects = Array.isArray(r.defects) ? [...new Set(r.defects.filter((d) => DEFECTS[d]))] : [];
  const packagingStatus = ['included', 'missing', 'not_shown'].includes(r.packagingStatus)
    ? r.packagingStatus : r.hasPackaging === true ? 'included' : 'not_shown';
  const imageIndexes = Array.isArray(r.imageIndexes)
    ? [...new Set(r.imageIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < imageCount))]
    : [];
  return {
    name,
    productType,
    brand,
    model,
    observedText,
    category: CATEGORIES[r.category] ? r.category : 'other',
    bundleKey: cleanKey(r.bundleKey ?? r.bundleGroup) || null,
    estimatedOriginalPrice: p.typical, // kept for UI/backward compatibility; means reference price.
    priceLow: p.low,
    priceHigh: p.high,
    priceType: PRICE_TYPES.has(r.priceType) ? r.priceType : 'new_street',
    priceBasis: clean(r.priceBasis),
    identityConfidence,
    conditionConfidence,
    priceConfidence,
    // `confidence` remains as an identity-confidence alias for old UI/data consumers.
    confidence: identityConfidence,
    condition,
    defects,
    repairability: normalizeRepairability(r, defects.includes('functional')),
    packagingStatus,
    hasPackaging: packagingStatus === 'included',
    notes: clean(r.notes),
    imageIndexes: imageIndexes.length ? imageIndexes : [0],
  };
}

// A catalog value replaces an AI estimate only when the catalog matcher marks it verified.
// Legacy objects without a status remain accepted for backwards-compatible callers/tests.
export function applyCatalogMatch(item, match) {
  const out = {
    ...item,
    aiEstimatedPrice: item.estimatedOriginalPrice,
    priceSource: 'ai',
    catalogMatchStatus: clean(match?.status ?? match?.matchStatus ?? 'unmatched', 24) || 'unmatched',
    catalogMatchScore: validNumber(match?.score) ? Number(match.score) : null,
    sku: null,
    catalogName: null,
  };
  const price = Number(match?.referencePrice ?? match?.retailPrice);
  const explicitStatus = match?.status ?? match?.matchStatus;
  const verified = explicitStatus === undefined || explicitStatus === 'verified';
  if (match?.sku && verified && Number.isFinite(price) && price > 0 && price <= 100000) {
    out.estimatedOriginalPrice = price;
    out.priceSource = 'catalog';
    out.sku = clean(match.sku, 40);
    out.catalogName = clean(match.name, 80);
    out.priceType = PRICE_TYPES.has(match.priceType) ? match.priceType : 'current_market';
    out.priceBasis = clean(match.priceBasis || `Verified catalog match: ${out.catalogName}`);
    out.priceCheckedAt = clean(match.priceCheckedAt, 20) || null;
    out.catalogMatchStatus = 'verified';
  } else {
    out.matchNote = clean(match?.reason || 'No verified catalog match.', 180);
  }
  return out;
}

// Conservative reference price. The catalog is a verified business source. For AI values, blend
// typical toward the low end using the weaker of identity and price confidence.
export function valuationPrice(item) {
  const typical = item.estimatedOriginalPrice;
  if (item.priceSource === 'catalog') return { price: typical, haircut: 0, confidence: 1 };
  const evidence = Math.min(item.identityConfidence, item.priceConfidence);
  const low = Number.isFinite(item.priceLow) && item.priceLow < typical ? item.priceLow : typical * 0.85;
  const price = round2(low + (typical - low) * evidence);
  return { price, haircut: round2(typical - price), confidence: evidence };
}

// ---------- Conservative recovery calculation ----------
const result = (viable, revenue, costs, note, revNote, costNote, extra = {}) => ({
  viable,
  revenue: round2(revenue),
  costs: round2(costs),
  net: round2(revenue - costs),
  note,
  revNote,
  costNote,
  ...extra,
});

function evidencePenalty(f) {
  // Price uncertainty is already handled in valuationPrice. This modest penalty reflects the fact that an
  // uncertain identity/condition lowers our confidence that the chosen channel will clear at its forecast price.
  return 0.85 + 0.15 * Math.min(f.identityConfidence, f.conditionConfidence);
}

function defectSellability(defects) {
  return defects.filter((d) => d !== 'functional').reduce((p, d) => p * DEFECTS[d].sellability, 1);
}

function itemFacts(item) {
  const category = CATEGORIES[item.category];
  const valuation = valuationPrice(item);
  const packaging = item.packagingStatus === 'missing' ? NO_PACKAGING_FACTOR : 1;
  // A current/renewed market price is already a market value. A new street price is converted to used market value.
  const market = ['current_market', 'renewed_market'].includes(item.priceType)
    ? valuation.price
    : valuation.price * category.retention;
  const repairShare = item.defects.reduce((sum, d) => sum + DEFECTS[d].repair, 0);
  return {
    item,
    category,
    valuation,
    market,
    asIs: market * CONDITIONS[item.condition].factor * packaging,
    packaging,
    repairCost: valuation.price * repairShare,
    working: !item.defects.includes('functional'),
    repairability: item.repairability,
    salvage: valuation.price * category.salvage,
    identityConfidence: item.identityConfidence,
    conditionConfidence: item.conditionConfidence,
    priceConfidence: item.priceConfidence,
    conditionSellability: CONDITIONS[item.condition].sellability,
    defectSellability: defectSellability(item.defects),
  };
}

// Expected sale result: chance of selling at route price + value recovered when an item fails to sell,
// less marketplace fees, operational cost and value lost waiting for a buyer.
function expectedSale(value, route, facts, { extraCost = 0, success = 1, restored = false } = {}) {
  const grade = restored ? CONDITIONS.A.sellability : facts.conditionSellability;
  const defects = restored ? 1 : facts.defectSellability;
  const sellThrough = clamp(route.sellThrough * grade * defects * evidencePenalty(facts) * success, 0, 1);
  const saleRevenue = sellThrough * value;
  const fallbackRevenue = (1 - sellThrough) * facts.salvage;
  const fees = saleRevenue * route.feeRate;
  const waitLoss = value * facts.category.depreciation * (route.days / 7);
  const fallbackCost = (1 - sellThrough) * facts.category.disposal;
  return {
    sellThrough,
    revenue: saleRevenue + fallbackRevenue,
    fees,
    waitLoss,
    fallbackCost,
    costs: fees + waitLoss + fallbackCost + extraCost,
  };
}

function routeReview(facts, best, runnerUp, results) {
  const reasons = [];
  if (facts.item.priceSource !== 'catalog' && facts.priceConfidence < 0.65) reasons.push('Price estimate has limited evidence.');
  if (facts.identityConfidence < 0.65) reasons.push('Item identity is not certain.');
  if (facts.conditionConfidence < 0.65) reasons.push('Condition is not certain.');
  if (facts.item.catalogMatchStatus === 'review' || facts.item.catalogMatchStatus === 'ambiguous') reasons.push('Catalog match needs review.');
  if (best === 'refurbish' && facts.repairability < 0.75) reasons.push('Repair outcome is uncertain.');
  if (runnerUp) {
    const gap = results[best].net - results[runnerUp].net;
    const threshold = Math.max(1, Math.abs(results[best].net) * 0.05);
    if (gap <= threshold) reasons.push('Top routes are nearly tied.');
  }
  return reasons;
}

export function evaluate(item) {
  const facts = itemFacts(item);
  const R = ROUTES;
  const asIsSale = expectedSale(facts.asIs, R.resell, facts, { extraCost: R.resell.fixed });
  const refurbishedValue = facts.market * R.refurbish.valueFactor * facts.packaging;
  const repairSuccess = facts.working ? 1 : facts.repairability;
  const refurbishedSale = expectedSale(refurbishedValue, R.refurbish, facts, {
    extraCost: R.refurbish.fixed + facts.repairCost,
    success: repairSuccess,
    restored: true,
  });
  const donateValue = facts.working ? facts.asIs * R.donate.taxRate : 0;
  const detail = (sale, route) => `${pct(sale.sellThrough)} expected to sell. Fees ${usd(sale.fees)}, value lost over ${route.days} days ${usd(sale.waitLoss)}.`;

  const results = {
    resell: facts.working
      ? result(true, asIsSale.revenue, asIsSale.costs, 'Sell as-is at a used price.',
        `Expected sale at ${usd(facts.asIs)} plus material recovery if it does not sell.`,
        `${detail(asIsSale, R.resell)} Handling ${usd(R.resell.fixed)}.`)
      : result(false, 0, 0, 'Cannot sell as-is: it has a functional fault.', 'Not possible.', 'Not possible.'),
    refurbish: repairSuccess > 0
      ? result(true, refurbishedSale.revenue, refurbishedSale.costs,
        facts.repairCost > 0 ? 'Repair and clean, then sell as refurbished.' : 'Clean and certify, then sell as refurbished.',
        `Expected sale at ${usd(refurbishedValue)} after repair, with a ${pct(repairSuccess)} repair-success assumption.`,
        `Repair ${usd(facts.repairCost)}. ${detail(refurbishedSale, R.refurbish)} Bench work ${usd(R.refurbish.fixed)}.`)
      : result(false, 0, 0, 'Do not refurbish: the fault is not repairable.', 'Not possible.', 'Not possible.'),
    bundle: result(false, 0, 0, 'Needs compatible low-value items to form a profitable bundle.',
      'Sold with compatible items as one lot.', 'One listing and shipment shared by the lot.'),
    donate: facts.working
      ? result(true, donateValue, R.donate.fixed, 'Donate to charity for a tax benefit.',
        `Tax benefit: fair value ${usd(facts.asIs)} × ${pct(R.donate.taxRate)}.`, `Shipping ${usd(R.donate.fixed)}.`)
      : result(false, 0, 0, 'Charities need working items.', 'Not possible.', 'Not possible.'),
    scrap: result(true, facts.salvage, facts.category.disposal, 'Recycle for material value.',
      `Recycler material value (${pct(facts.category.salvage)} of reference price).`, `Disposal ${usd(facts.category.disposal)}.`),
  };
  return rank({ results, facts });
}

function rank(decision) {
  const ranked = OPTIONS.filter((key) => decision.results[key].viable)
    .sort((a, b) => decision.results[b].net - decision.results[a].net || CIRCULAR_RANK[a] - CIRCULAR_RANK[b]);
  const best = ranked[0];
  const runnerUp = ranked[1] || null;
  const tolerance = Math.max(0.5, Math.abs(decision.results[best].net) * 0.03);
  const greenerKey = ranked.find((key) => CIRCULAR_RANK[key] < CIRCULAR_RANK[best]
    && decision.results[best].net - decision.results[key].net <= tolerance);
  const reviewReasons = routeReview(decision.facts, best, runnerUp, decision.results);
  return {
    ...decision,
    ranked,
    best,
    runnerUp,
    greener: greenerKey ? { route: greenerKey, gap: round2(decision.results[best].net - decision.results[greenerKey].net) } : null,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    savings: round2(decision.results[best].net - decision.results.scrap.net),
    market: round2(decision.facts.market),
    asIs: round2(decision.facts.asIs),
    repairCost: round2(decision.facts.repairCost),
    valuation: round2(decision.facts.valuation.price),
    haircut: decision.facts.valuation.haircut,
  };
}

// Independent decision for one item.
export function decide(item) {
  return evaluate(item);
}

// ---------- Compatible bundles (plan level) ----------
const individualNet = (item) => item.decision.results[item.decision.individualBest].net;
const compatibleKey = (item) => item.bundleKey ? `${item.category}:${item.bundleKey}` : null;
const isLowValue = (item) => item.decision.facts.working && Boolean(compatibleKey(item))
  && ROUTES.resell.fixed >= ROUTES.bundle.lowValueCostShare * item.decision.facts.asIs;

function lotEconomics(members) {
  const R = ROUTES.bundle;
  let revenue = 0;
  let fees = 0;
  let waitLoss = 0;
  let fallbackCost = 0;
  for (const member of members) {
    const facts = member.decision.facts;
    const value = facts.asIs * R.lotFactor;
    const sale = expectedSale(value, R, facts, { extraCost: 0 });
    revenue += sale.revenue;
    fees += sale.fees;
    waitLoss += sale.waitLoss;
    fallbackCost += sale.fallbackCost;
  }
  const sharedCost = R.fixedPerLot + R.perItem * members.length;
  const costs = fees + waitLoss + fallbackCost + sharedCost;
  return { revenue, costs, net: revenue - costs, fees, waitLoss, sharedCost };
}

// Choose the best compatible subset, not a broad category-level lot. There are at most 12 candidates,
// so enumerating subsets is small, transparent and avoids a brittle greedy choice.
function bestLot(candidates) {
  const max = Math.min(candidates.length, ROUTES.bundle.maxItems);
  const pool = [...candidates].sort((a, b) => individualNet(a) - individualNet(b)).slice(0, max);
  let best = null;
  const totalMasks = 2 ** pool.length;
  for (let mask = 0; mask < totalMasks; mask += 1) {
    const size = mask.toString(2).replaceAll('0', '').length;
    if (size < ROUTES.bundle.minItems) continue;
    const members = pool.filter((_, index) => mask & (1 << index));
    const economics = lotEconomics(members);
    const separate = members.reduce((sum, member) => sum + individualNet(member), 0);
    const uplift = economics.net - separate;
    if (uplift > 0.5 && (!best || uplift > best.uplift || (uplift === best.uplift && members.length > best.members.length))) {
      best = { members, economics, uplift };
    }
  }
  return best;
}

function bundleResult(member, members, economics, id, key) {
  const totalValue = members.reduce((sum, m) => sum + m.decision.facts.asIs, 0) || 1;
  const weight = member.decision.facts.asIs / totalValue;
  const surplus = economics.net - members.reduce((sum, m) => sum + individualNet(m), 0);
  const net = individualNet(member) + surplus * weight;
  const revenue = economics.revenue * weight;
  return result(true, revenue, revenue - net,
    `Sell in bundle ${id} with ${members.length - 1} compatible item(s): one listing, one shipment.`,
    `Its share of a ${members.length}-item ${key.replaceAll('-', ' ')} bundle.`,
    `Its share of marketplace fees, value lost while waiting and ${usd(economics.sharedCost)} shared handling.`,
    { lot: { id, size: members.length, key, items: members.map((m) => m.name), uplift: round2(surplus) } });
}

function priceLot(members, id, key, targets = members) {
  const economics = lotEconomics(members);
  for (const member of targets) member.decision.results.bundle = bundleResult(member, members, economics, id, key);
}

// Individual routes first; then one best positive bundle per compatible group.
export function planDecisions(items, { lotIds = 'ABCDEFGHIJ' } = {}) {
  const planned = items.map((item) => {
    const decision = decide(item);
    return { ...item, decision: { ...decision, individualBest: decision.best, lotHome: null } };
  });
  const groups = new Map();
  for (const item of planned) {
    if (!isLowValue(item)) continue;
    const key = compatibleKey(item);
    (groups.get(key) || groups.set(key, []).get(key)).push(item);
  }
  let n = 0;
  for (const [key, candidates] of groups) {
    const chosen = bestLot(candidates);
    if (!chosen) continue;
    const id = lotIds[n] || String(n + 1);
    n += 1;
    for (const member of chosen.members) member.decision.lotHome = id;
    priceLot(chosen.members, id, key);
  }
  for (const item of planned) Object.assign(item.decision, rank(item.decision));
  return planned;
}

// Reprice the remaining compatible members after a manager takes an item out of a bundle. If fewer than two
// compatible items remain, their selections return to their individual recommendation instead of silently re-forming a lot.
export function replan(items, chosen) {
  const next = [...chosen];
  const homes = new Map();
  items.forEach((item, index) => {
    if (!item.decision.lotHome) return;
    (homes.get(item.decision.lotHome) || homes.set(item.decision.lotHome, []).get(item.decision.lotHome)).push(index);
  });
  for (const [id, indexes] of homes) {
    const selected = indexes.filter((index) => next[index] === 'bundle');
    const key = compatibleKey(items[indexes[0]]) || 'compatible-items';
    if (selected.length < ROUTES.bundle.minItems) {
      for (const index of selected) next[index] = items[index].decision.individualBest;
      continue;
    }
    const members = selected.map((index) => items[index]);
    const economics = lotEconomics(members);
    const separate = members.reduce((sum, item) => sum + individualNet(item), 0);
    if (economics.net - separate <= 0.5) {
      for (const index of selected) next[index] = items[index].decision.individualBest;
      continue;
    }
    priceLot(members, id, key);
    for (const index of indexes) Object.assign(items[index].decision, rank(items[index].decision));
  }
  return { items, chosen: next };
}

// ---------- Explanation and totals ----------
export function buildReason(item, decision) {
  const best = decision.best;
  const route = decision.results[best];
  const parts = [];
  parts.push(`${item.name} is grade ${item.condition}${item.defects.length ? ` with ${item.defects.map((d) => DEFECTS[d].label.toLowerCase()).join(', ')}` : ''}.`);
  if (best === 'bundle') parts.push(`Bundle ${route.lot.id} shares one listing and shipment across ${route.lot.size} compatible items.`);
  if (!decision.results.resell.viable) parts.push('It cannot be sold or donated as-is because of its functional fault.');
  parts.push(`${OPTION_LABEL[best]} has the highest conservative recovery at ${usd(route.net)}.`);
  if (best !== 'scrap') parts.push(`That is ${usd(decision.savings)} more than scrapping it.`);
  if (decision.needsReview) parts.push(`Check: ${decision.reviewReasons[0]}`);
  return parts.join(' ');
}

export function summarize(items, chosen = []) {
  let net = 0;
  let saved = 0;
  let diverted = 0;
  items.forEach((item, index) => {
    const key = chosen[index] && item.decision.results[chosen[index]]?.viable ? chosen[index] : item.decision.best;
    net += item.decision.results[key].net;
    saved += item.decision.results[key].net - item.decision.results.scrap.net;
    if (key !== 'scrap') diverted += 1;
  });
  return { net: round2(net), saved: round2(saved), diverted };
}
