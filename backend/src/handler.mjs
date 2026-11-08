// Reconomy API. One Lambda, two routes:
//   POST /analyze  { images: [base64 jpeg, ...] } -> AI-identified items with decisions and reasons
//   POST /approve  { id, choices: ['resell', ...] } -> stores the approved plan
import { randomUUID } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CATEGORIES, CONDITIONS, DEFECTS, OPTIONS, normalizeItem, applyCatalogMatch, applyRates, resetRates, planDecisions, buildReason,
} from './decision.mjs';

const { BUCKET, TABLE, MODEL_ID, CATALOG_FUNCTION, ALLOWED_ORIGIN = '*' } = process.env;
const MAX_IMAGES = 8;
const MAX_ITEMS = 20; // a photo can contain more than one distinct product
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const reply = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
  body: JSON.stringify(body),
});

class BadRequest extends Error {}

export async function handler(event) {
  try {
    const path = event.rawPath || '';
    let body;
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}'); }
    catch { throw new BadRequest('Body must be JSON.'); }
    if (path.endsWith('/analyze')) return reply(200, await analyzeRoute(body));
    if (path.endsWith('/approve')) return reply(200, await approveRoute(body));
    return reply(404, { error: 'Not found.' });
  } catch (e) {
    if (e instanceof BadRequest) return reply(400, { error: e.message });
    console.error(e);
    const msg = e.name === 'AccessDeniedException'
      ? 'Bedrock access denied. Enable the model in the Bedrock console for this region.'
      : 'Analysis failed. Please try again.';
    return reply(500, { error: msg });
  }
}

// ---------- /analyze ----------
async function analyzeRoute(body) {
  const imgs = Array.isArray(body.images) ? body.images : [];
  if (!imgs.length) throw new BadRequest('Send at least one image.');
  if (imgs.length > MAX_IMAGES) throw new BadRequest(`At most ${MAX_IMAGES} images per request.`);
  const buffers = imgs.map((b64, i) => {
    if (typeof b64 !== 'string') throw new BadRequest(`Image ${i + 1} is invalid.`);
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) throw new BadRequest(`Image ${i + 1} is empty or too large.`);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new BadRequest(`Image ${i + 1} must be JPEG.`);
    return buf;
  });

  const id = randomUUID();
  const keys = buffers.map((_, i) => `returns/${id}/${i}.jpg`);
  await Promise.all(buffers.map((buf, i) => s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: keys[i], Body: buf, ContentType: 'image/jpeg',
  }))));

  const rawItems = await identifyItems(buffers);
  const catalog = await catalogLookup(rawItems);
  if (catalog?.ok) applyRates(catalog.rates);
  else resetRates();
  const items = planDecisions(rawItems.map((r, i) => applyCatalogMatch(
    normalizeItem(r, buffers.length), catalog?.ok ? catalog.matches[i] : null,
  )));

  const reasons = await explain(items).catch((e) => { console.error('explain failed', e); return null; });
  items.forEach((it, i) => {
    const text = reasons?.[i];
    it.reason = typeof text === 'string' && text.trim() ? text.trim().slice(0, 600) : buildReason(it, it.decision);
    it.reasonSource = typeof text === 'string' && text.trim() ? 'bedrock' : 'rules';
  });

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      id, createdAt: new Date().toISOString(), status: 'analyzed', modelId: MODEL_ID, imageKeys: keys,
      items: items.map((it) => ({
        name: it.name, brand: it.brand, model: it.model, observedText: it.observedText,
        category: it.category, originalPrice: it.estimatedOriginalPrice, priceSource: it.priceSource, sku: it.sku,
        priceBasis: it.priceBasis,
        identityConfidence: it.identityConfidence, conditionConfidence: it.conditionConfidence, priceConfidence: it.priceConfidence,
        condition: it.condition, defects: it.defects, repairability: it.repairability, packagingStatus: it.packagingStatus, hasPackaging: it.hasPackaging,
        imageIndexes: it.imageIndexes, recommended: it.decision.best, savings: it.decision.savings,
        netByOption: Object.fromEntries(OPTIONS.map((k) => [k, it.decision.results[k].net])), reason: it.reason,
      })),
    },
  }));

  return { id, items, catalog };
}

async function catalogLookup(rawItems) {
  if (!CATALOG_FUNCTION) return { ok: false, error: 'No catalog function configured.' };
  try {
    const payload = rawItems.map((item) => ({
      name: item.name || '', brand: item.brand || null, model: item.model || null,
      category: item.category || 'other', identityConfidence: item.identityConfidence ?? item.confidence ?? 0.5,
      observedText: Array.isArray(item.observedText) ? item.observedText : [],
    }));
    const out = await lambda.send(new InvokeCommand({
      FunctionName: CATALOG_FUNCTION,
      Payload: Buffer.from(JSON.stringify({ items: payload })),
    }));
    if (out.FunctionError) throw new Error(Buffer.from(out.Payload || []).toString());
    const body = JSON.parse(Buffer.from(out.Payload || []).toString() || '{}');
    if (body.error || !Array.isArray(body.matches) || body.matches.length !== rawItems.length) throw new Error(body.error || 'Invalid catalog response.');
    return { ok: true, function: CATALOG_FUNCTION, ...body };
  } catch (error) {
    console.error('catalog lookup failed', error);
    return { ok: false, function: CATALOG_FUNCTION, error: 'Catalog lookup unavailable; using AI price estimates.' };
  }
}

const VISION_PROMPT = `You are a careful returns inspector for a retail store. The photos above show returned products.
Your job is to report only what the photos support. Accuracy matters more than a detailed guess.

Rules:
- List EVERY separate sellable product. If a photo has several products, return one object for each and use the same photo index.
- Group photos only when they clearly show the SAME physical item from different angles.
- Copy brand names, model numbers, labels and packaging text only when you can see them. Put that text in observedText.
  observedText must contain literal visible text or logos only, never a condition statement such as "no visible defects".
- Only give a brand or model when visible text or an unmistakable logo supports it. Do not infer a specific model from colour or shape.
  If the exact model is unclear, name the generic product type, set brand and model to null, and lower identityConfidence.
- Grade the condition you can see: A = no visible wear, B = light wear, C = clear wear, marks or stains, D = heavy damage.
  If some sides are not visible, grade what you can see and lower conditionConfidence; do not lower the grade for that.
  Shadows, reflections, studio backgrounds and screen glare are not damage. List a defect only when you can see it.
- retailPriceToday is what a US shopper pays for this product today at mainstream retailers (Amazon, Walmart, Target, Best Buy
  or the brand's own store), including normal everyday discounts. Use the new price while the product is still sold new. If it is
  no longer sold new, use today's certified-renewed price, which is often far below the launch price.
  Never use a launch MSRP, an old price or a used price.
  Price the actual product in the photos. If no model text is visible but the design is distinctive enough that a product expert
  would recognise the product line and generation, price that product as the closest visual match. If several generations share
  the design, price the one the visible details fit best; if they fit equally, price the older one.
  Only for a generic design, price the most common mid-range product of that type; never assume a premium brand for a generic design.
  In priceBasis, name the product you priced, say "new" or "renewed", and add "closest visual match" when no model text is visible.
  This price rule does not relax the naming rules: name, brand and model stay limited to visible evidence.
- Never name a model from a visual silhouette alone. A specific generation or model must be present in observedText; otherwise use productType only and lower identityConfidence.
- Do not invent a brand, a model number, packaging or a working condition.
- Set bundleKey only when this item can sensibly be sold with OTHER matching items as one consumer-facing lot (examples: identical shirts,
  USB-C cables, phone cases). Use a short normalized type such as "usb-c-cable". Otherwise return null; never use a broad category like "apparel".
- Set repairability only for a functional fault: "repairable", "unknown", or "not_repairable". Use "unknown" when a photo cannot establish repair success.

Return ONLY a JSON array, no prose, no markdown. One object per product:
{
 "name": concise evidence-supported name; generic type when exact identity is unclear,
 "productType": short generic product type visible in the image (for example "running shoe" or "over-ear headphones"),
 "brand": visible brand string or null,
 "model": visible model string or null,
 "observedText": array of text or labels visibly read from the photos,
 "category": one of ${JSON.stringify(Object.keys(CATEGORIES))},
 "bundleKey": compatible product type string or null,
 "priceBasis": one short sentence naming the product you priced and whether the price is new or renewed,
 "retailPriceToday": USD a shopper pays for that product at retail today, new or certified renewed (number),
 "identityConfidence": confidence in the exact identity, 0 to 1,
 "conditionConfidence": confidence in the condition grade, 0 to 1,
 "priceConfidence": confidence in retailPriceToday, 0 to 1,
 "condition": one of ${JSON.stringify(Object.keys(CONDITIONS))} (A like new, B good, C fair, D poor),
 "defects": array using only ${JSON.stringify(Object.keys(DEFECTS))},
 "repairability": "repairable", "unknown", "not_repairable", or null,
 "packagingStatus": one of ["included", "not_shown", "missing"]. Use "included" only if original packaging is visible; use "not_shown" unless the photo clearly proves it is missing,
 "notes": one short factual sentence about visible evidence,
 "imageIndexes": zero-based indexes of photos showing this product
}
If a photo shows no product, leave it out. If nothing is a product, return [].`;

async function identifyItems(buffers) {
  const content = [];
  buffers.forEach((bytes, i) => {
    content.push({ text: `Photo ${i}:` });
    content.push({ image: { format: 'jpeg', source: { bytes } } });
  });
  content.push({ text: VISION_PROMPT });
  const text = await converse(content, 4000);
  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) throw new Error(`Model did not return a JSON array: ${text.slice(0, 200)}`);
  return parsed.slice(0, MAX_ITEMS);
}

async function explain(items) {
  const facts = items.map((it, i) => ({
    index: i, name: it.name, category: it.category, condition: it.condition, defects: it.defects,
    priceSource: it.priceSource === 'catalog' ? `store catalog (${it.sku})` : 'AI estimate',
    originalPrice: it.estimatedOriginalPrice,
    identityConfidence: it.identityConfidence, conditionConfidence: it.conditionConfidence, priceConfidence: it.priceConfidence,
    assessmentNeedsReview: it.decision.needsReview, reviewReasons: it.decision.reviewReasons,
    recommended: it.decision.best, savedVersusScrap: it.decision.savings,
    netRecoveryValueByOption: Object.fromEntries(it.decision.ranked.map((k) => [k, it.decision.results[k].net])),
    notViable: OPTIONS.filter((k) => !it.decision.results[k].viable),
    bundle: it.decision.best === 'bundle' ? { lot: it.decision.results.bundle.lot.id, itemsInLot: it.decision.results.bundle.lot.size, key: it.decision.results.bundle.lot.key } : null,
    greenerOption: it.decision.greener ? { route: it.decision.greener.route, costsLess: it.decision.greener.gap } : null,
  }));
  const prompt = `For each returned item below, write 2 short sentences for a store manager explaining why the recommended route brings back the most money (net recovery value). If it is a bundle, say it is sold as a lot with other items. If a greener option is given, mention it in a few words. If assessmentNeedsReview is true, say the plan should be checked before routing.
Use the exact dollar figures given. Mention the money saved versus scrapping. Do not invent numbers. Write plain language and never mention field names.
Return ONLY a JSON array of strings, in the same order.
${JSON.stringify(facts)}`;
  const parsed = parseJson(await converse([{ text: prompt }], 1200));
  return Array.isArray(parsed) && parsed.length === items.length ? parsed : null;
}

async function converse(content, maxTokens) {
  const out = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content }],
    // No temperature: newer Claude models on Bedrock reject it.
    inferenceConfig: { maxTokens },
  }));
  return (out.output?.message?.content || []).map((c) => c.text || '').join('');
}

function parseJson(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (start < 0 || end < start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

// ---------- /approve ----------
async function approveRoute(body) {
  const { id, choices } = body;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new BadRequest('Invalid id.');
  if (!Array.isArray(choices) || choices.length > MAX_ITEMS || !choices.every((c) => OPTIONS.includes(c))) {
    throw new BadRequest('Invalid choices.');
  }
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET #s = :s, approvedChoices = :c, approvedAt = :t',
      ConditionExpression: 'attribute_exists(id) AND size(#items) = :n',
      ExpressionAttributeNames: { '#s': 'status', '#items': 'items' },
      ExpressionAttributeValues: { ':s': 'approved', ':c': choices, ':t': new Date().toISOString(), ':n': choices.length },
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') throw new BadRequest('Unknown analysis or wrong number of choices.');
    throw e;
  }
  return { ok: true };
}
