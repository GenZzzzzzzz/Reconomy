// Reconomy API. One Lambda, two routes:
//   POST /analyze  { images: [base64 jpeg, ...] } -> AI-identified items with decisions and reasons
//   POST /approve  { id, choices: ['resell', ...] } -> stores the approved plan
import { randomUUID } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CATEGORIES, CONDITIONS, DEFECTS, OPTIONS, normalizeItem, applyCatalogMatch, planDecisions, buildReason,
} from './decision.mjs';

const { BUCKET, TABLE, MODEL_ID, ALLOWED_ORIGIN = '*' } = process.env;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});
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
  const items = planDecisions(rawItems.map((r) => applyCatalogMatch(normalizeItem(r, buffers.length), null)));

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
        name: it.name, category: it.category, estimatedOriginalPrice: it.estimatedOriginalPrice,
        condition: it.condition, defects: it.defects, hasPackaging: it.hasPackaging, confidence: it.confidence,
        imageIndexes: it.imageIndexes, recommended: it.decision.best, savings: it.decision.savings,
        netByOption: Object.fromEntries(OPTIONS.map((k) => [k, it.decision.results[k].net])), reason: it.reason,
      })),
    },
  }));

  return { id, items };
}

const VISION_PROMPT = `You are a careful returns inspector for a retail store. The photos above show returned products.
Rules:
- List EVERY separate sellable product. If one photo shows several products (e.g. a phone and earbuds),
  return one object per product, each with that photo's index.
- Only group photos into one item when they clearly show the SAME physical product from different angles.
- Be specific: brand, model and colour when you can see or reliably recognise them. Do not guess a model you cannot tell.
- Grade only what is visible. A clean product with no visible wear is condition A.
  Add a defect only if you can actually see it in the photo; if unsure, leave defects empty.
- Price like a market analyst, not a sticker. The price is what a US shopper actually paid for this item
  new in the last 12 months at mainstream retailers (Amazon, Walmart, Target, Best Buy, the brand store),
  including the usual discounts. Never use the launch price or original MSRP of an older model.
- If the model is no longer sold new, price it at what it sells for today at mainstream retailers
  (clearance, outlet or certified renewed), not what it cost when it launched.
- Price a specific model only when brand and model are visible or certain. Otherwise price the generic
  product type at a mid-market retailer, and do not assume a premium brand.
- When unsure, pick the lower plausible figure: an overestimate inflates every recovery decision.
Return ONLY a JSON array, no prose, no markdown. One object per product:
{
 "name": short product name (e.g. "Sony WH-1000XM4 headphones"),
 "category": one of ${JSON.stringify(Object.keys(CATEGORIES))},
 "priceLow": lowest common street price in USD (number),
 "priceTypical": most common street price in USD (number, between priceLow and priceHigh),
 "priceHigh": highest common street price in USD (number),
 "priceBasis": one short sentence on what the price is based on (model year, discontinued or not, where it sells),
 "condition": one of ${JSON.stringify(Object.keys(CONDITIONS))} (A like new, B good, C fair, D poor),
 "defects": array using only ${JSON.stringify(Object.keys(DEFECTS))} (use "functional" only for visible breakage that stops it working),
 "hasPackaging": true if original packaging is visible,
 "confidence": 0 to 1,
 "notes": one short sentence on what you observed,
 "imageIndexes": zero-based indexes of the photos showing this product
}
If a photo shows no product, leave it out.`;

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
  return parsed.slice(0, MAX_IMAGES);
}

async function explain(items) {
  const facts = items.map((it, i) => ({
    index: i, name: it.name, condition: it.condition, defects: it.defects,
    recommended: it.decision.best, savedVersusScrap: it.decision.savings,
    netRecoveryValueByOption: Object.fromEntries(it.decision.ranked.map((k) => [k, it.decision.results[k].net])),
    notViable: OPTIONS.filter((k) => !it.decision.results[k].viable),
    bundle: it.decision.best === 'bundle' ? { lot: it.decision.results.bundle.lot.id, itemsInLot: it.decision.results.bundle.lot.size } : null,
    greenerOption: it.decision.greener ? { route: it.decision.greener.route, costsLess: it.decision.greener.gap } : null,
  }));
  const prompt = `For each returned item below, write 2 short sentences for a store manager explaining why the recommended route brings back the most money (net recovery value). If it is a bundle, say it is sold as a lot with other items. If a greener option is given, mention it in a few words.
Use the exact dollar figures given. Mention the money saved versus scrapping. Do not invent numbers.
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
  if (!Array.isArray(choices) || choices.length > MAX_IMAGES || !choices.every((c) => OPTIONS.includes(c))) {
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
