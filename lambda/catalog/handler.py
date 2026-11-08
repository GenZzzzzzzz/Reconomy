"""reconomy-catalog Lambda.

Loads the store's product catalog (catalog.csv) and business rates (rates.json) from Amazon S3 and matches the
products Bedrock identified to real catalog rows, so pricing uses real retail prices instead of AI guesses.

Event:  {"items": [{"name": "...", "category": "electronics"}, ...]}
Result: {"rates": {...}, "catalogVersion": "...", "catalogSize": n,
         "matches": [{"sku", "name", "retailPrice", "score"} | {"sku": null, "reason": "..."}]}
"""
import csv
import io
import json
import os
import re

import boto3

BUCKET = os.environ["BUCKET"]
CATALOG_KEY = os.environ.get("CATALOG_KEY", "data/catalog.csv")
RATES_KEY = os.environ.get("RATES_KEY", "data/rates.json")
s3 = boto3.client("s3")

# Words that describe a product type or look, not a specific model. They never decide a match on their own.
GENERIC = set("""
a an the and with in of for by style model edition version type unbranded unclear unknown brand branded
shoe shoes sneaker sneakers trainer trainers running headphones headphone earphones earbuds earbud wireless
bluetooth over on ear in-ear noise cancelling smartphone phone mobile cell case leather silicone protective
black white red crimson orange grey gray space silver gold blue green brown pink purple yellow navy beige
university team dark light bright matte glossy pair set only face id series like
""".split())

_cache = {}  # per-container cache keyed by S3 ETag, so a new upload is picked up automatically


def tokens(text):
    return [t for t in re.split(r"[^a-z0-9]+", str(text).lower().replace("'", "")) if t]


def load(key):
    head = s3.head_object(Bucket=BUCKET, Key=key)
    etag = head["ETag"]
    hit = _cache.get(key)
    if hit and hit[0] == etag:
        return hit[1], etag
    body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read().decode("utf-8")
    _cache[key] = (etag, body)
    return body, etag


def load_catalog():
    text, etag = load(CATALOG_KEY)
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            price = float(r["retail_price"])
        except (KeyError, ValueError):
            continue
        brand = (r.get("brand") or "").strip()
        name_tokens = set(tokens(r["name"])) - set(tokens(brand))
        rows.append({
            "sku": r["sku"].strip(), "name": r["name"].strip(), "brand": brand,
            "brandTokens": set(tokens(brand)), "category": r.get("category", "other").strip(),
            "price": price,
            "all": set(tokens(r["name"])) | set(tokens(r.get("keywords", ""))),
            "specific": {t for t in name_tokens if t not in GENERIC},
        })
    return rows, etag.strip('"')


def match(item, catalog, brands):
    words = set(tokens(item.get("name", "")))
    category = item.get("category", "other")
    named_brands = {b for b in brands if b and set(b.split()) <= words}

    if named_brands:
        candidates = [r for r in catalog if " ".join(sorted(r["brandTokens"])) in named_brands]
    else:
        candidates = [r for r in catalog if r["brand"].lower() == "generic"]
    candidates = [r for r in candidates if category == "other" or r["category"] == category]
    if not candidates:
        return {"sku": None, "reason": "No catalog product with this brand and category."}

    brand_words = set().union(*(set(b.split()) for b in named_brands)) if named_brands else set()
    specific = words - GENERIC - brand_words
    # Model numbers and generations ("11", "1st", "xm4") must match exactly; a wrong one means a different price.
    # Release years ("2017") are descriptive, not part of the model, so they are ignored here.
    model_tokens = {t for t in specific if re.search(r"\d", t) and not re.fullmatch(r"(19|20)\d\d", t)}

    scored = []
    for r in candidates:
        if model_tokens - r["all"]:
            continue
        if specific:
            hit = len(specific & r["all"])
            ai_cov = hit / len(specific)
            row_cov = (len(specific & r["specific"]) / len(r["specific"])) if r["specific"] else 0
            score = 0.7 * ai_cov + 0.3 * row_cov
            ok = ai_cov >= 0.6
        else:
            # Unbranded, generic description: match on product type words only.
            overlap = len(words & r["all"]) / max(len(words - {"a", "the", "and", "with"}), 1)
            score, ok = 0.5 * overlap, overlap >= 0.5
        if ok:
            scored.append((round(score, 3), r))
    if not scored:
        return {"sku": None, "reason": "The model name did not match any catalog product."}

    scored.sort(key=lambda x: -x[0])
    best_score, best = scored[0]
    if len(scored) > 1 and best_score - scored[1][0] < 0.05 and best["price"] != scored[1][1]["price"]:
        return {"sku": None, "reason": f"Ambiguous: could be {best['name']} or {scored[1][1]['name']}."}
    return {"sku": best["sku"], "name": best["name"], "retailPrice": best["price"], "score": best_score}


def handler(event, context):
    items = event.get("items") if isinstance(event, dict) else None
    if not isinstance(items, list) or len(items) > 20:
        return {"error": "items must be a list of at most 20 products."}
    catalog, version = load_catalog()
    rates = json.loads(load(RATES_KEY)[0])
    brands = {" ".join(sorted(r["brandTokens"])) for r in catalog if r["brand"].lower() != "generic"}
    matches = [match(it if isinstance(it, dict) else {}, catalog, brands) for it in items]
    print(json.dumps({"items": len(items), "matched": sum(1 for m in matches if m.get("sku"))}))
    return {"rates": rates, "catalogVersion": version, "catalogSize": len(catalog), "matches": matches}
