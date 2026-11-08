// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItem, applyCatalogMatch, decide, planDecisions, replan, summarize, applyRates, ROUTES, OPTIONS,
} from '../logic.js';

const item = (o) => applyCatalogMatch(normalizeItem({
  name: 'Item', category: 'apparel', bundleKey: 'test-shirt', retailPriceToday: 20,
  condition: 'B', defects: [], hasPackaging: false, confidence: 0.9, ...o,
}), null);

test('every route has a result and the best is the highest viable net', () => {
  const d = decide(item({ name: 'Phone', category: 'electronics', retailPriceToday: 300, condition: 'A' }));
  for (const k of OPTIONS) assert.ok(d.results[k], k);
  const viable = OPTIONS.filter((k) => d.results[k].viable);
  assert.equal(d.best, viable.reduce((a, b) => (d.results[b].net > d.results[a].net ? b : a)));
  assert.equal(d.best, 'resell');
  assert.ok(d.results.resell.net > 0);
});

test('a functional fault rules out resell and donate', () => {
  const d = decide(item({ category: 'electronics', retailPriceToday: 200, defects: ['functional'] }));
  assert.equal(d.results.resell.viable, false);
  assert.equal(d.results.donate.viable, false);
  assert.ok(['refurbish', 'scrap'].includes(d.best));
});

test('the original price is used as-is: the AI estimate, or a verified catalog price instead', () => {
  const unsure = decide(item({ retailPriceToday: 100, confidence: 0.2 }));
  const sure = decide(item({ retailPriceToday: 100, confidence: 1 }));
  assert.equal(unsure.market, sure.market, 'confidence never changes the price');
  assert.equal(sure.market, 40, 'apparel used-market value is 40% of the original price');
  assert.ok(unsure.needsReview, 'low confidence is flagged instead');
  const cat = applyCatalogMatch(normalizeItem({ retailPriceToday: 120, confidence: 0.9 }), { sku: 'X', status: 'verified', referencePrice: 90 });
  assert.equal(cat.estimatedOriginalPrice, 90);
  assert.equal(cat.aiEstimatedPrice, 120);
  const weak = applyCatalogMatch(normalizeItem({ retailPriceToday: 120 }), { sku: 'X', status: 'review', referencePrice: 90 });
  assert.equal(weak.estimatedOriginalPrice, 120, 'an unverified catalog match keeps the AI estimate');
  assert.equal(normalizeItem({ originalPrice: 75 }).estimatedOriginalPrice, 75, 'the older AI field name is still read');
  const none = normalizeItem({ name: 'Mystery item' });
  assert.equal(none.priceConfidence, 0);
  assert.ok(decide(applyCatalogMatch(none, null)).reviewReasons.includes('Price estimate has limited evidence.'));
});

test('low-value items in the same category are bundled, and every member earns more than alone', () => {
  const shirts = [1, 2, 3, 4].map((n) => item({ name: `Shirt ${n}` }));
  const plan = planDecisions(shirts);
  for (const it of plan) {
    assert.equal(it.decision.best, 'bundle', it.name);
    assert.ok(it.decision.results.bundle.net > it.decision.results[it.decision.individualBest].net);
    assert.equal(it.decision.results.bundle.lot.size, 4);
  }
  // The plan as a whole beats selling each item on its own best route.
  const alone = plan.reduce((s, it) => s + it.decision.results[it.decision.individualBest].net, 0);
  assert.ok(summarize(plan).net > alone);
});

test('valuable items are not bundled, and categories are never mixed', () => {
  const plan = planDecisions([
    item({ name: 'Phone', category: 'electronics', retailPriceToday: 400, condition: 'A' }),
    item({ name: 'Cable', category: 'electronics', retailPriceToday: 12 }),
    item({ name: 'Shirt', category: 'apparel' }),
  ]);
  assert.equal(plan[0].decision.best, 'resell');
  for (const it of plan) assert.equal(it.decision.results.bundle.viable, false, it.name);
});

test('a mid-value item is not pulled into a lot of cheap items', () => {
  const plan = planDecisions([1, 2, 3, 4].map((n) => item({ name: `Shirt ${n}` }))
    .concat([item({ name: 'Sneaker', retailPriceToday: 90, condition: 'A' })]));
  assert.equal(plan[4].decision.lotHome, null);
  assert.equal(plan[4].decision.best, 'resell');
  assert.equal(plan[0].decision.best, 'bundle');
});

test('a broken item is never put into a lot', () => {
  const plan = planDecisions([1, 2, 3, 4].map((n) => item({ name: `S${n}`, defects: n === 1 ? ['functional'] : [] })));
  assert.equal(plan[0].decision.results.bundle.viable, false);
  assert.equal(plan[0].decision.lotHome, null);
});

test('replan: leaving a lot re-prices it and a one-item lot safely returns to its own route', () => {
  const plan = planDecisions([1, 2].map(() => item({})).concat([1, 2].map(() => item({}))));
  let chosen = plan.map((it) => it.decision.best);
  assert.deepEqual(chosen, ['bundle', 'bundle', 'bundle', 'bundle']);

  chosen[0] = 'scrap';
  ({ chosen } = replan(plan, chosen, 0));
  assert.equal(plan[1].decision.results.bundle.lot.size, 3);
  assert.equal(plan[0].decision.results.bundle.viable, true, 'can rejoin');

  chosen[1] = 'scrap'; chosen[2] = 'scrap';
  ({ chosen } = replan(plan, chosen, 2));
  assert.equal(chosen[3], plan[3].decision.individualBest, 'last member goes back to its own route');

  // A single item cannot silently re-form a bundle by overriding every other manager choice.
  chosen[0] = 'bundle';
  ({ chosen } = replan(plan, chosen, 0));
  assert.equal(chosen[0], plan[0].decision.individualBest, 'one item returns to its own route');
});

test('a greener near-equal route is pointed out without changing the recommendation', () => {
  const d = decide(item({ category: 'electronics', retailPriceToday: 120, condition: 'A', confidence: 1 }));
  assert.equal(d.best, d.ranked[0]);
  if (d.greener) assert.ok(d.results[d.best].net - d.results[d.greener.route].net <= Math.max(0.5, Math.abs(d.results[d.best].net) * 0.03));
});

test('route profiles can be tuned from rates.json; invalid values are ignored', () => {
  const before = ROUTES.bundle.lotFactor;
  applyRates({ routes: { bundle: { lotFactor: 0.7, sellThrough: 7 } } });
  assert.equal(ROUTES.bundle.lotFactor, 0.7);
  assert.equal(ROUTES.bundle.sellThrough, 0.98, 'out of range value ignored');
  applyRates({ routes: { bundle: { lotFactor: before } } });
});
