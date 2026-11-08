# Reconomy

AI-powered returns recovery. Upload photos of returned products. AI identifies each item, grades its condition,
estimates its value, and recommends the most profitable route (resell, refurbish, donate or scrap), with the reason
and the money saved versus scrapping.

**AWS enables scalable AI-powered inventory recovery.**

## Pages

- **Home** (`#`): our title and only the figures with a clear before/after gap: loss per returned dollar
  ($0.90 vs $0.51), value recovered (40% vs 70%), value wasted per $1M (-50%), days back on the shelf, margin per
  item (1x vs 3-5x), and the saving per $1M / $100M. Code: `home.js`. Hero photo from Unsplash.
- **Tool** (`#assess`): an operations-desk layout for Upload → Assess → Compare → Approve → Result.
  Clickable stepper, sticky action bar, item list with detail panel, condition-grade meter, profit-by-route chart,
  segmented route picker on Approve, next-step checklists and a CSV export of the approved plan.

Statistics on the home page (each has an info tip with its source):
NRF and Happy Returns, *2025 Retail Returns Landscape* (15.8% of sales, $849.9B, 19.3% online) and McKinsey
reverse logistics research ($200B spent recovering value; ~50% of worth recovered, as cited by GSPANN).

The before/after figures use the manual end of each published range for "Manual" and the AI-driven end for
"Reconomy": ReturnPro's maturity model (recovery below 40% vs above 70%, 15-30% lower cost per return, 3-5x margin
from refurbish and resell vs liquidation), Locus (processing 15-30% of item price, 8-12 vs 3-5 days to shelf) and the
NRF 19.3% online return rate. ReturnPro and Locus are vendors; these are benchmarks, not measured Reconomy results.

## Architecture

```
Browser ──POST /analyze──▶ API Gateway (HTTP) ──▶ AWS Lambda
                                                  ├─ Amazon S3        stores the return photos
                                                  ├─ Amazon Bedrock   identifies products + writes the explanation
                                                  ├─ decision logic   profit per route, picks the max
                                                  └─ DynamoDB         stores items, decisions, approvals
Browser ──POST /approve──▶ Lambda ──▶ DynamoDB (approved routes)
```

## Run locally with real AI (Amazon Bedrock)

`server/app.py` serves the app and calls Bedrock with boto3 (Converse API). Default model:
**`us.anthropic.claude-opus-4-8`** (Claude Opus 4.8).

Why this model: benchmarked on 5 real product photos (6 products, one photo with 2 products) using the app's prompt.
Opus 4.8 found all 6 products in both runs, gave the most specific names (e.g. "Nike Air Max 1 Ultra Moire"),
invented no defects, ~9 s. Runners-up: Claude Opus 5 (equally specific, but flagged false defects),
GPT-5.6 Sol (slower, invented a brand). Llama 4 Scout/Maverick accept only 3 images per request, Nova Pro merged
different products. Note: Opus 4.8 rejects the `temperature` parameter, so the app does not send it.

1. Create `.env` in the project root (it is git-ignored, never commit it):
   ```
   AWS_DEFAULT_REGION=us-east-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_SESSION_TOKEN=...
   BEDROCK_MODEL_ID=us.anthropic.claude-opus-4-8
   ```
   Temporary (Workshop Studio) keys expire. When they do, paste new ones and restart the server.
2. Install and run:
   ```
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/python server/app.py
   ```
3. Open http://localhost:8000. The badge shows "Live · Bedrock".

Photos: JPG, PNG, WEBP and HEIC (iPhone). Chrome cannot decode HEIC, so the server converts it to JPEG
(`/api/convert`, Pillow + pillow-heif). The server log prints how many images each analysis sent and what came back.

Flow: Bedrock inspects the photos (product, category, price, condition, defects) → `logic.js` computes the
profit of each route and picks the max → Bedrock writes the explanation from those exact numbers.

Do not serve this folder with `python3 -m http.server`. It would expose `.env`. Without the Bedrock server the
app falls back to demo mode (simulated AI).

## Deploy the real backend

Needs the AWS CLI and AWS SAM CLI, plus model access for Amazon Nova Lite (or another image-capable model) in the
Bedrock console.

```
./scripts/sync-logic.sh
cd backend
sam build
sam deploy --guided            # region e.g. us-east-1
```

Copy the `ApiUrl` output into `config.js`:

```js
export const API_BASE = 'https://xxxx.execute-api.us-east-1.amazonaws.com';
```

The badge in the header switches to "Live · AWS". To use a different model, pass
`--parameter-overrides ModelId=<model or inference profile id>`. For production, set `AllowedOrigin` to your site's URL.

## How the original price is set

1. **Catalog price** (most objective): if AWS Lambda matches the item to `data/catalog.csv` in S3, that price
   is used. Model numbers and generations must match exactly ("AirPods Pro 1st gen" never takes the 2nd-gen price).
2. **AI street price** otherwise: Bedrock returns `priceLow` / `priceTypical` / `priceHigh` and a `priceBasis`.
   It prices what a US shopper actually pays today at mainstream retailers, never the launch MSRP; discontinued
   models are priced at today's clearance or renewed price; unclear brands are priced as the generic product; when
   unsure it picks the lower figure. The app uses the typical price, kept inside the range (`streetPrice` in `logic.js`).

The model has no live web access, so AI prices reflect its training data. Put real prices in the catalog for anything
that matters. The sample catalog uses approximate current street prices, not verified quotes.

## Store data in Amazon S3 + AWS Lambda (real prices and rates)

After Bedrock identifies the items, the server invokes the Lambda **`reconomy-catalog`**
(`lambda/catalog/handler.py`). It loads `data/catalog.csv` and `data/rates.json` from the S3 bucket
`reconomy-data-<account>` and matches each item to a catalog product (brand + model words). Matched items use the
**real retail price** instead of the AI's guess. Ambiguous names (e.g. "Apple iPhone" with no model) are not
matched, and the AI estimate is shown and labelled as such. All rates in the profit math come from `rates.json`.

```
.venv/bin/python scripts/setup_aws.py              # create/update bucket, role, Lambda (idempotent)
.venv/bin/python scripts/setup_aws.py --data-only  # after editing data/catalog.csv or data/rates.json
.venv/bin/python scripts/teardown_aws.py           # delete everything it created
```

The catalog and rates in `data/` are **sample data**. Replace them with your store's real numbers.
If the Lambda is unavailable, the app keeps working with AI estimates and built-in rates, and shows a warning.

## Decision logic (`logic.js`)

Built around the three gaps in the Reconomy presentation.

**1. Net recovery value is always the objective.** Every route is scored with the same formula:

```
NRV = sellThrough x price + (1 - sellThrough) x salvage          expected revenue (unsold goods are recycled)
    - fees - fixed costs - repair
    - price x weekly depreciation x days / 7                       value lost while the item waits
```

**2. Each route has its own cost profile** (`ROUTES`, overridable in `data/rates.json` → `routes`):

| Route | Sells for | Fees | Fixed | Days | Sell-through |
|---|---|---|---|---|---|
| Resell | used price as-is | 12% | $5 handling | 14 | 90% |
| Refurbish | 92% of used-market value, minus repair | 12% | $10 bench labor | 21 | 95% |
| Bundle | 75% of the lot's single prices | 8% | $7 per lot + $0.50 per item | 7 | 98% |
| Donate | tax benefit 25% of fair value | – | $3 shipping | – | – |
| Scrap | material value | – | disposal fee | – | – |

**3. Low-value items are bundled.** After scoring each item alone, a plan-level optimiser looks at low-value
items per category (where one listing's handling would eat at least a third of the item's value). It starts with
all of them, removes any item that adds less to the lot than it earns alone, and accepts the lot only if it beats
selling separately. Each member gets its own best value plus a share of the lot's surplus, so every member earns
more in the lot. On Approve, removing an item re-prices the lot; choosing Bundle again re-forms it (`replan`).

**Uncertain prices are priced cautiously.** Catalog prices are trusted. AI estimates are shaded toward the low end
of their own range as confidence drops: `price - (1 - confidence) x (price - low)`.

**Repurpose and reduce waste.** The highest NRV always wins. If a more circular route (reuse > repair > reuse in
bulk > repurpose > recycle) is within $0.50 or 3%, it is shown as a greener option. The result shows how many
items were kept in use instead of scrapped.

Money saved = recommended NRV - scrap NRV. All rates are sample assumptions.

Tests: `node --test tests/logic.test.mjs` (decision engine) and
`.venv/bin/python -m unittest discover lambda/catalog` (catalog matcher).
