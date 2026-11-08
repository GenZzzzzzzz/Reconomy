# Reconomy

AI-powered returns recovery. Upload photos of returned products. AI identifies each item, grades its condition,
estimates its value, and recommends the most profitable route (resell, refurbish, donate or scrap), with the reason
and the money saved versus scrapping.

**AWS enables scalable AI-powered inventory recovery.**

## Pages

- **Home** (`#`): full-screen hero carousel on the returns problem (5 slides, auto-advance with pause, keyboard
  arrows, no motion with *reduced motion*), then problem stats, the four routes, the 5-step flow and AWS services.
  Code: `home.js`. Photos in `assets/` are from Unsplash.
- **Tool** (`#assess`): the 5-step flow Upload → Assess → Compare → Approve → Result.

Statistics on the home page (each has an info tip with its source):
NRF and Happy Returns, *2025 Retail Returns Landscape* (15.8% of sales, $849.9B, 19.3% online) and McKinsey
reverse logistics research ($200B spent recovering value; ~50% of worth recovered, as cited by GSPANN).

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

## Decision logic

`logic.js` is shared by the browser and the Lambda (`backend/src/decision.mjs` is a copy. Run
`scripts/sync-logic.sh` after editing). Net profit per route:

- Resell: as-is value − 12% fees − $5 handling. Not possible with a functional fault.
- Refurbish: refurbished value − repair cost − 12% fees − $5 handling.
- Donate: 25% tax benefit on as-is value − $3 shipping. Not possible with a functional fault.
- Scrap: material salvage − disposal fee.

As-is value = original price × category retention × condition factor (× 0.92 without packaging).
Money saved = recommended net profit − scrap net profit. All rates are assumptions, tune them in `logic.js`.
