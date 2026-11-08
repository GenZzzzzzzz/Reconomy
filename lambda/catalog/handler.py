"""reconomy-catalog Lambda.

Matches Bedrock's evidence-supported product identity to a store catalog in S3. A catalog price is returned
only for a high-confidence, unambiguous match. Weak matches keep the AI's price estimate instead of replacing it
with a possibly wrong catalog value.

Event:  {"items": [{"name", "brand", "model", "category", "identityConfidence", "observedText"}, ...]}
Result: {"rates", "catalogVersion", "catalogSize", "matches"}
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

# A catalog price becomes authoritative only when the model has enough visual identity evidence.
MIN_IDENTITY_CONFIDENCE = 0.70
MIN_VERIFIED_SCORE = 0.85
AMBIGUITY_GAP = 0.10

# Words that describe a product type or appearance, not a reliably identifying model token.
GENERIC = set("""
a an the and with in of for by style model edition version type unbranded unclear unknown brand branded
shoe shoes sneaker sneakers trainer trainers running headphones headphone earphones earbuds earbud wireless
bluetooth over on ear in-ear noise cancelling smartphone phone mobile cell case leather silicone protective
black white red crimson orange grey gray space silver gold blue green brown pink purple yellow navy beige
university team dark light bright matte glossy pair set only face id series like generation gen single left right front back side view visible shown image
""".split())

_cache = {}  # per-container cache keyed by S3 ETag; new uploads are picked up automatically


def tokens(text):
    return [t for t in re.split(r"[^a-z0-9]+", str(text).lower().replace("'", "")) if t]


def clean(value, limit=160):
    return str(value or "").replace("\n", " ").strip()[:limit]


def confidence(value, fallback=0.5):
    try:
        return min(max(float(value), 0), 1)
    except (TypeError, ValueError):
        return fallback


def response(status, reason, *, row=None, score=None, alternatives=None):
    out = {"sku": None, "status": status, "reason": reason}
    if score is not None:
        out["score"] = round(score, 3)
    if alternatives:
        out["alternatives"] = alternatives[:2]
    if row and status == "verified":
        out.update({
            "sku": row["sku"],
            "name": row["name"],
            "referencePrice": row["price"],
            # Kept while existing browser/deployed clients migrate to referencePrice.
            "retailPrice": row["price"],
            "priceType": row["priceType"],
            "priceBasis": row["priceBasis"],
            "priceCheckedAt": row["priceCheckedAt"],
        })
    return out


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
    for record in csv.DictReader(io.StringIO(text)):
        try:
            price = float(record.get("reference_price", record.get("retail_price", "")))
        except (TypeError, ValueError):
            continue
        if not (0 < price <= 100_000) or not clean(record.get("sku")):
            continue
        brand = clean(record.get("brand"), 80)
        name = clean(record.get("name"), 160)
        name_tokens = set(tokens(name)) - set(tokens(brand))
        price_type = clean(record.get("price_type"), 40) or "current_market"
        if price_type not in {"new_street", "current_market", "renewed_market", "unknown"}:
            price_type = "current_market"
        rows.append({
            "sku": clean(record["sku"], 60),
            "name": name,
            "brand": brand,
            "brandTokens": set(tokens(brand)),
            "category": clean(record.get("category"), 40) or "other",
            "price": price,
            "priceType": price_type,
            "priceBasis": clean(record.get("price_basis"), 180) or "Store catalog reference price.",
            "priceCheckedAt": clean(record.get("price_checked_at"), 20) or None,
            "all": set(tokens(name)) | set(tokens(record.get("keywords", ""))),
            "specific": {token for token in name_tokens if token not in GENERIC},
        })
    return rows, etag.strip('"')


def evidence_tokens(item):
    parts = [item.get("name", ""), item.get("brand", ""), item.get("model", "")]
    observed = item.get("observedText", [])
    if isinstance(observed, list):
        parts.extend(observed)
    return set(tokens(" ".join(clean(part) for part in parts)))


def visible_tokens(item):
    observed = item.get("observedText", [])
    if not isinstance(observed, list):
        return set()
    return set(tokens(" ".join(clean(part) for part in observed)))


def visible_support(terms, visible, required=0.60):
    terms = {token for token in terms if token not in GENERIC}
    if not terms:
        return True
    return len(terms & visible) / len(terms) >= required


def match(item, catalog):
    if not isinstance(item, dict):
        return response("unmatched", "Invalid product identity.")
    category = clean(item.get("category"), 40)
    identity = confidence(item.get("identityConfidence", item.get("confidence")))
    words = evidence_tokens(item)
    visible = visible_tokens(item)
    claimed_brand = set(tokens(item.get("brand") or ""))
    claimed_model = set(tokens(item.get("model") or ""))
    if not visible:
        return response("review", "No visible label or model text supports a catalog price.")
    if claimed_brand and not visible_support(claimed_brand, visible, 1):
        return response("review", "Brand claim is not supported by visible text.")
    if claimed_model and not visible_support(claimed_model, visible):
        return response("review", "Model claim is not supported by visible text.")
    if category not in {row["category"] for row in catalog}:
        return response("unmatched", "No matching catalog category.")
    if identity < MIN_IDENTITY_CONFIDENCE:
        return response("review", "Identity confidence is too low to trust a catalog match.", score=identity)

    # A catalog match must have a visible brand. We intentionally do not replace the AI estimate with
    # a generic product row, even if the type looks similar.
    branded = [row for row in catalog if row["brandTokens"] and row["brandTokens"] <= words and row["category"] == category]
    if not branded:
        visible_brand_elsewhere = any(row["brandTokens"] and row["brandTokens"] <= words for row in catalog)
        if visible_brand_elsewhere:
            return response("unmatched", "Visible brand does not have a catalog product in this category.")
        return response("review", "No visible catalog brand; kept the AI price estimate.")

    brand_words = set().union(*(row["brandTokens"] for row in branded))
    specific = {token for token in words - GENERIC - brand_words if not re.fullmatch(r"(19|20)\d\d", token)}
    model_tokens = {token for token in specific if re.search(r"\d", token)}
    scored = []
    for row in branded:
        # A visible model number/generation must exist in the matched catalog record.
        if model_tokens - row["all"]:
            continue
        if not specific:
            continue  # Brand alone cannot choose a catalog price.
        hit = len(specific & row["all"])
        evidence_coverage = hit / len(specific)
        catalog_coverage = len(specific & row["specific"]) / len(row["specific"]) if row["specific"] else 0
        # Missing a storage colour or packaging suffix should not erase a precise visible model match.
        score = 0.85 * evidence_coverage + 0.15 * catalog_coverage
        if evidence_coverage >= 0.60:
            scored.append((round(score, 3), row))
    if not scored:
        return response("review", "Visible product details do not support a catalog price.")

    scored.sort(key=lambda pair: -pair[0])
    best_score, best = scored[0]
    alternatives = [f"{row['name']} ({score:.0%})" for score, row in scored[1:3]]
    if len(scored) > 1 and best_score - scored[1][0] < AMBIGUITY_GAP:
        return response("ambiguous", "More than one catalog product fits the visible details.", score=best_score,
                        alternatives=[f"{best['name']} ({best_score:.0%})", *alternatives])
    if best_score < MIN_VERIFIED_SCORE:
        return response("review", f"Closest catalog match is only {best_score:.0%} supported by visible details.",
                        score=best_score, alternatives=[f"{best['name']} ({best_score:.0%})", *alternatives])
    return response("verified", "Verified catalog match.", row=best, score=best_score)


def handler(event, context):
    items = event.get("items") if isinstance(event, dict) else None
    if not isinstance(items, list) or len(items) > 20:
        return {"error": "items must be a list of at most 20 products."}
    catalog, version = load_catalog()
    rates = json.loads(load(RATES_KEY)[0])
    matches = [match(item, catalog) for item in items]
    print(json.dumps({
        "items": len(items),
        "verified": sum(1 for matched in matches if matched.get("status") == "verified"),
        "review": sum(1 for matched in matches if matched.get("status") == "review"),
    }))
    return {"rates": rates, "catalogVersion": version, "catalogSize": len(catalog), "matches": matches}
