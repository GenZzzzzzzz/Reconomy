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

Flow: Bedrock reads the visible evidence (product, labels, condition, defects) and estimates the original price →
S3 catalog matching swaps in the catalog price for a verified match → `logic.js` calculates the net recovery value of
every route → Bedrock writes the explanation using those exact results.

Do not serve this folder with `python3 -m http.server`. It would expose `.env`.
Without a reachable AI server the app shows **AI offline**, explains how to start it, and produces no results
(there are no simulated or sample results). Static hosting such as GitHub Pages therefore cannot run the analysis.

## Deploy the real backend

Needs the AWS CLI and AWS SAM CLI, plus Bedrock model access for the image model (default Claude Opus 4.8).
Run `.venv/bin/python scripts/setup_aws.py` first so the `reconomy-catalog` Lambda exists. Without it the API still
works, but uses the AI's price estimates instead of catalog prices.

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

## Original price

Each item has one price, its **original price**: what a US shopper pays for it at retail today. That is the new
price, or the certified-renewed price once the product is no longer sold new.

1. **Catalog price:** AWS Lambda matches the name, visible brand/model text and identity confidence against
   `data/catalog.csv` in S3. For a high-confidence, unambiguous match, the catalog price is used. Generic
   descriptions, wrong model generations and ambiguous matches keep the AI estimate.
2. **AI estimate:** otherwise Bedrock returns `retailPriceToday`: the price at mainstream US retailers (Amazon,
   Walmart, Target, Best Buy, the brand's own store), including everyday discounts. Never a launch MSRP, an old price
   or a used price. Without visible model text, a distinctive design is priced as its closest visual match (the
   older generation when several look alike); a generic design gets the most common mid-range product of its type.
   `priceBasis` names the product priced and says new or renewed. The AI writes `priceBasis` before the number, so
   the number follows from the named product.

The price is used as-is. Identity, condition and price confidence never change it; a low confidence adds an amber
review flag instead. Used value = original price × the category's used-market share × the condition-grade factor
(× 0.92 when the original packaging is visibly missing).

Condition grade: A = no visible wear, B = light wear, C = clear wear, marks or stains, D = heavy damage. Sides the
photos do not show lower the condition confidence, not the grade.

Bedrock has no live web access. Catalog prices are the source of truth for operational decisions. The included
catalog is sample data, so replace it with your store's real price feed and update `price_checked_at`.

## Store data in Amazon S3 + AWS Lambda (real prices and rates)

After Bedrock identifies the items, the server invokes **`reconomy-catalog`** (`lambda/catalog/handler.py`). It loads
`data/catalog.csv` and `data/rates.json` from `reconomy-data-<account>`, and only returns a catalog reference for a
high-confidence, unambiguous brand/model match supported by visible evidence. The response records a `verified`,
`review`, `ambiguous` or `unmatched` status, score and price date. Weak matches keep the AI's price estimate.
Route rates come from `rates.json`.

```
.venv/bin/python scripts/setup_aws.py              # create/update bucket, role, Lambda (idempotent)
.venv/bin/python scripts/setup_aws.py --data-only  # after editing data/catalog.csv or data/rates.json
.venv/bin/python scripts/teardown_aws.py           # delete everything it created
```

The catalog and rates in `data/` are **sample data**. Replace them with your store's real numbers.
If the Lambda is unavailable, the app keeps working with AI estimates and built-in rates, and shows a warning.

## Decision logic (`logic.js`)

The algorithm has four simple stages:

1. **Check the evidence.** The AI reports only evidence it can see: visible text, brand/model, condition and
   defects. A weak identity or price estimate, unclear condition, ambiguous catalog match, risky repair
   or near-tied result becomes an amber **review** flag rather than a hidden assumption.
2. **Calculate the net recovery value of every route.** Every route uses the same formula:

   ```
   net recovery value = expected sale + unsold-item salvage
                      - marketplace fees - handling - repair - disposal
                      - market value lost while waiting
   ```

   Expected sale chance changes with the route, condition, visible defects and evidence confidence. Refurbishment
   also includes the chance that a functional repair succeeds. This makes a risky repair less attractive than a
   clean, verified resale even when its headline price looks higher.
3. **Bundle only compatible low-value items.** The AI supplies an explicit compatible `bundleKey` such as
   `usb-c-cable` or `plain-shirt`. Reconomy compares every small compatible subset with selling those members
   separately and accepts a bundle only when it clears a minimum $0.50 uplift. It never bundles an entire broad
   category such as apparel. Removing an item from a bundle re-prices the remaining members; a one-item bundle
   safely returns to that item's individual route.
4. **Recommend and explain.** The highest net recovery value wins. If a more circular route is within $0.50
   or 3%, Reconomy shows it as a greener option without hiding the money difference. Savings are always compared
   to scrap, and the result counts items kept in use.

Each analysis resets to built-in rates before applying the current S3 rate file, so a failed catalog lookup cannot
reuse rates from a prior analysis. All rates are sample assumptions and should be replaced with store data.

Tests: `node --test tests/logic.test.mjs` (decision engine) and
`.venv/bin/python -m unittest discover lambda/catalog` (catalog matcher).
