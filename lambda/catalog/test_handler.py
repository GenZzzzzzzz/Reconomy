"""Unit tests for the conservative catalog matcher.
Run: .venv/bin/python -m unittest discover lambda/catalog
"""
import os
import unittest
from pathlib import Path

os.environ.setdefault("BUCKET", "test")
import handler as H  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
H.load = lambda key: ((ROOT / key).read_text(), '"local"')  # read data/ files instead of S3
CATALOG, _ = H.load_catalog()


def match(name, category, *, brand=None, model=None, identity=0.95, observed=None):
    return H.match({
        "name": name, "brand": brand, "model": model, "category": category,
        "identityConfidence": identity, "observedText": observed if observed is not None else [name],
    }, CATALOG)


class MatchTest(unittest.TestCase):
    def test_exact_models_are_verified(self):
        cases = [
            ("Nike Free RN Flyknit (red/crimson)", "apparel", "NK-FRN-FK-RED"),
            ("Nike Air Max 1 Ultra Moire (white/orange)", "apparel", "NK-AM1-ULM-WO"),
            ("Apple iPhone X (space gray)", "electronics", "AP-IPX-64-SG"),
            ("Sony WH-1000XM4 headphones", "electronics", "SN-WH1000XM4"),
            ("Sony WH-1000XM5 headphones", "electronics", "SN-WH1000XM5"),
            ("Apple AirPods Pro (2nd generation)", "electronics", "AP-APP-2"),
        ]
        for name, category, expected in cases:
            got = match(name, category)
            self.assertEqual(got["status"], "verified", name)
            self.assertEqual(got["sku"], expected, name)
            self.assertGreaterEqual(got["score"], H.MIN_VERIFIED_SCORE, name)

    def test_weak_and_ambiguous_matches_keep_ai_estimate(self):
        self.assertEqual(match("Black over-ear wireless headphones", "electronics")["status"], "review")
        self.assertEqual(match("Apple iPhone (brown leather case)", "electronics")["status"], "ambiguous")
        self.assertEqual(match("Samsung Galaxy S23", "electronics")["status"], "review")
        self.assertEqual(match("Apple iPhone X", "electronics", identity=0.5)["status"], "review")

    def test_wrong_generation_and_category_never_match(self):
        self.assertNotEqual(match("Apple AirPods Pro (1st generation)", "electronics")["status"], "verified")
        self.assertNotEqual(match("Apple iPhone 13", "electronics")["status"], "verified")
        self.assertEqual(match("Nike Air Max 1", "electronics")["status"], "unmatched")

    def test_price_metadata_is_returned_for_verified_match(self):
        got = match("Nike Free RN Flyknit 2017 (Team Red)", "apparel")
        self.assertEqual(got["status"], "verified")
        self.assertEqual(got["priceType"], "current_market")
        self.assertIn("referencePrice", got)
        self.assertIn("priceBasis", got)


if __name__ == "__main__":
    unittest.main()
