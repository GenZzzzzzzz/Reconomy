"""Reconomy local server.

Serves the web app and calls Amazon Bedrock with boto3 (Converse API).
Credentials come from .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN).

Routes:
  GET  /api/health   -> {"ok": true, "model": ...}
  POST /api/analyze  {"images": [base64 jpeg, ...]}   -> {"items": [...]}   AI product inspection
  POST /api/explain  {"facts": [...]}                 -> {"reasons": [...]} AI explanation of the decision

Run:  .venv/bin/python server/app.py   then open http://localhost:8000
"""
import base64
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import io

import boto3
import pillow_heif
from botocore.config import Config
from dotenv import load_dotenv
from PIL import Image, ImageOps

pillow_heif.register_heif_opener()  # lets Pillow open HEIC/HEIF (iPhone photos)
Image.MAX_IMAGE_PIXELS = 60_000_000  # refuse decompression bombs

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
# Inference profile ID (requires the us. prefix). Must accept image input.
# Claude Opus 4.8 won our accuracy benchmark (see README).
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-opus-4-8")
PORT = int(os.getenv("PORT", "8000"))
# Lambda that matches AI-identified items to the store catalog in S3 (created by scripts/setup_aws.py).
CATALOG_FUNCTION = os.getenv("CATALOG_FUNCTION", "reconomy-catalog")
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 1_500_000
MAX_BODY = 16_000_000
MAX_CONVERT_BYTES = 10_000_000  # one original photo (HEIC etc.) before conversion

# Must match logic.js
CATEGORIES = ["electronics", "apparel", "furniture", "appliances", "toys", "other"]
CONDITIONS = ["A", "B", "C", "D"]
DEFECTS = ["cosmetic", "functional", "missing", "hygiene"]

# Only these files are served. Everything else (.env, .venv, backend code) is never exposed.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/api.js": ("api.js", "text/javascript; charset=utf-8"),
    "/logic.js": ("logic.js", "text/javascript; charset=utf-8"),
    "/config.js": ("config.js", "text/javascript; charset=utf-8"),
    "/logo.svg": ("logo.svg", "image/svg+xml"),
}

client = boto3.client(
    service_name="bedrock-runtime",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),  # required for temporary / Workshop Studio credentials
    region_name=REGION,
    config=Config(read_timeout=90, retries={"max_attempts": 2}),
)


lambda_client = boto3.client(
    service_name="lambda",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
    region_name=REGION,
    config=Config(read_timeout=20, retries={"max_attempts": 2}),
)


class BadRequest(Exception):
    pass


def catalog_lookup(items):
    """AWS Lambda reads the real catalog + rates from S3 and matches each item. Never fails the analysis."""
    try:
        out = lambda_client.invoke(FunctionName=CATALOG_FUNCTION, Payload=json.dumps({
            "items": [{"name": x.get("name", ""), "category": x.get("category", "other")} for x in items]}).encode())
        body = json.loads(out["Payload"].read())
        if out.get("FunctionError") or "error" in body or len(body.get("matches", [])) != len(items):
            raise RuntimeError(str(body)[:300])
        hits = sum(1 for m in body["matches"] if m.get("sku"))
        print(f"catalog: Lambda {CATALOG_FUNCTION} matched {hits}/{len(items)} item(s) "
              f"against {body.get('catalogSize')} products in S3", file=sys.stderr)
        return {"ok": True, "function": CATALOG_FUNCTION, **body}
    except Exception as e:
        print(f"catalog: Lambda {CATALOG_FUNCTION} unavailable, using AI price estimates. "
              f"Reason: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return {"ok": False, "function": CATALOG_FUNCTION,
                "error": "Catalog lookup unavailable, using AI price estimates."}


# ---------- Bedrock ----------
def converse(content, max_tokens):
    """One Converse call. Returns the model's text (skips reasoningContent blocks)."""
    # No temperature/topP: newer Claude and GPT models on Bedrock reject those fields.
    response = client.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"maxTokens": max_tokens},
    )
    blocks = response["output"]["message"]["content"]
    # Some models put reasoningContent first; take the text blocks only.
    return "".join(b["text"] for b in blocks if "text" in b)


def parse_json(text):
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    starts = [i for i in (cleaned.find("["), cleaned.find("{")) if i >= 0]
    end = max(cleaned.rfind("]"), cleaned.rfind("}"))
    if not starts or end < min(starts):
        return None
    try:
        return json.loads(cleaned[min(starts): end + 1])
    except json.JSONDecodeError:
        return None


VISION_PROMPT = f"""You are a careful returns inspector for a retail store. The photos above show returned products.
Rules:
- List EVERY separate sellable product. If one photo shows several products (e.g. a phone and earbuds),
  return one object per product, each with that photo's index.
- Only group photos into one item when they clearly show the SAME physical product from different angles.
- Be specific: brand, model and colour when you can see or reliably recognise them. Do not guess a model you cannot tell.
- Grade only what is visible. A clean product with no visible wear is condition A.
  Add a defect only if you can actually see it in the photo; if unsure, leave defects empty.
Return ONLY a JSON array, no prose, no markdown. One object per product:
{{
 "name": short specific product name (brand and model if visible),
 "category": one of {json.dumps(CATEGORIES)},
 "estimatedOriginalPrice": typical new retail price in USD as a number,
 "condition": one of {json.dumps(CONDITIONS)} (A like new, B good, C fair, D poor),
 "defects": array using only {json.dumps(DEFECTS)} ("functional" only for visible breakage that stops it working),
 "hasPackaging": true if original packaging is visible, else false,
 "confidence": number from 0 to 1,
 "notes": one short sentence on what you observed,
 "imageIndexes": zero-based indexes of the photos showing this product
}}
If a photo shows no product, leave it out. If nothing is a product, return []."""


def analyze(images_b64):
    if not isinstance(images_b64, list) or not images_b64:
        raise BadRequest("Send at least one image.")
    if len(images_b64) > MAX_IMAGES:
        raise BadRequest(f"At most {MAX_IMAGES} images per request.")
    content = []
    for i, b64 in enumerate(images_b64):
        try:
            data = base64.b64decode(b64, validate=True)
        except (ValueError, TypeError):
            raise BadRequest(f"Image {i + 1} is not valid base64.")
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise BadRequest(f"Image {i + 1} is empty or too large.")
        if data[:2] != b"\xff\xd8":
            raise BadRequest(f"Image {i + 1} must be JPEG.")
        content.append({"text": f"Photo {i}:"})
        content.append({"image": {"format": "jpeg", "source": {"bytes": data}}})
    content.append({"text": VISION_PROMPT})

    sizes = [len(c["image"]["source"]["bytes"]) // 1024 for c in content if "image" in c]
    print(f"analyze: {len(sizes)} image(s) sent to {MODEL_ID}, sizes KB={sizes}", file=sys.stderr)
    text = converse(content, 4000)
    items = parse_json(text)
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        print("Unparseable model output:", text[:500], file=sys.stderr)
        raise RuntimeError("The AI returned an unreadable answer. Please try again.")
    items = [x for x in items if isinstance(x, dict)][:MAX_IMAGES]
    print(f"analyze: model returned {len(items)} item(s): "
          + "; ".join(f"{x.get('name')} {x.get('imageIndexes')}" for x in items), file=sys.stderr)
    return items


def convert(image_b64):
    """Converts a photo the browser cannot decode (mainly HEIC) into a JPEG, max 1024px."""
    if not isinstance(image_b64, str) or not image_b64:
        raise BadRequest("Send one image.")
    try:
        data = base64.b64decode(image_b64, validate=True)
    except (ValueError, TypeError):
        raise BadRequest("Image is not valid base64.")
    if len(data) > MAX_CONVERT_BYTES:
        raise BadRequest("Photo is too large (max 10 MB).")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((1024, 1024))
            out = io.BytesIO()
            im.save(out, "JPEG", quality=85)
    except Exception:
        raise BadRequest("This file is not a supported image.")
    return base64.b64encode(out.getvalue()).decode()


def explain(facts):
    if not isinstance(facts, list) or not facts or len(facts) > MAX_IMAGES:
        raise BadRequest("Invalid facts.")
    prompt = (
        "For each returned item below, write 2 short sentences for a store manager explaining why the "
        "recommended route earns the most money. Use the exact dollar figures given. Mention the money saved "
        "versus scrapping. Do not invent numbers. If priceSource is the store catalog, say the price comes "
        "from the store catalog.\n"
        "Return ONLY a JSON array of strings, in the same order, no markdown.\n" + json.dumps(facts)
    )
    reasons = parse_json(converse([{"text": prompt}], 1200))
    if not isinstance(reasons, list) or len(reasons) != len(facts):
        return None
    return [str(r)[:600] if isinstance(r, str) else None for r in reasons]


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = "Reconomy"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, fmt % args))

    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "model": MODEL_ID, "region": REGION,
                                        "catalogFunction": CATALOG_FUNCTION})
        entry = STATIC.get(path)
        if not entry:
            return self.send_json(404, {"error": "Not found."})
        data = (ROOT / entry[0]).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", entry[1])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                raise BadRequest("Request body is missing or too large.")
            try:
                body = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                raise BadRequest("Body must be JSON.")
            if not isinstance(body, dict):
                raise BadRequest("Body must be a JSON object.")
            if self.path == "/api/analyze":
                items = analyze(body.get("images"))
                catalog = catalog_lookup(items) if items else None
                return self.send_json(200, {"items": items, "model": MODEL_ID, "catalog": catalog})
            if self.path == "/api/convert":
                return self.send_json(200, {"image": convert(body.get("image"))})
            if self.path == "/api/explain":
                return self.send_json(200, {"reasons": explain(body.get("facts"))})
            return self.send_json(404, {"error": "Not found."})
        except BadRequest as e:
            return self.send_json(400, {"error": str(e)})
        except Exception as e:  # Bedrock / network errors
            name = type(e).__name__
            print(f"ERROR: Can't invoke '{MODEL_ID}'. Reason: {e} (Exception type: {name})", file=sys.stderr)
            msg = str(e) if isinstance(e, RuntimeError) else "The AI request failed. Please try again."
            code = getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else ""
            if code in ("ExpiredTokenException", "UnrecognizedClientException", "InvalidSignatureException"):
                msg = "AWS credentials are expired or invalid. Update .env and restart the server."
            elif code == "AccessDeniedException":
                msg = f"No access to Bedrock model {MODEL_ID}. Enable it in the Bedrock console."
            return self.send_json(502, {"error": msg})


if __name__ == "__main__":
    if not os.getenv("AWS_ACCESS_KEY_ID"):
        sys.exit("Missing AWS credentials. Put them in .env (see README).")
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Reconomy running at http://localhost:{PORT}  (model: {MODEL_ID}, region: {REGION})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
