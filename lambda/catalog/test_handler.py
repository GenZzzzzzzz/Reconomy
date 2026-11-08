"""Unit tests for the catalog matcher. Run: .venv/bin/python -m unittest discover lambda/catalog"""
import os
import unittest
from pathlib import Path

os.environ.setdefault("BUCKET", "test")
import handler as H  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
H.load = lambda key: ((ROOT / key).read_text(), '"local"')  # read data/ files instead of S3
CATALOG, _ = H.load_catalog()
BRANDS = {" ".join(sorted(r["brandTokens"])) for r in CATALOG if r["brand"].lower() != "generic"}


def sku(name, category):
    return H.match({"name": name, "category": category}, CATALOG, BRANDS).get("sku")


class MatchTest(unittest.TestCase):
    def test_exact_models(self):
        self.assertEqual(sku("Nike Free RN Flyknit (red/crimson)", "apparel"), "NK-FRN-FK-RED")
        self.assertEqual(sku("Nike Air Max 1 Ultra Moire (white/orange)", "apparel"), "NK-AM1-ULM-WO")
        self.assertEqual(sku("Apple iPhone X (space gray)", "electronics"), "AP-IPX-64-SG")
        self.assertEqual(sku("Sony WH-1000XM4 headphones", "electronics"), "SN-WH1000XM4")
        self.assertEqual(sku("Sony WH-1000XM5 headphones", "electronics"), "SN-WH1000XM5")
        self.assertEqual(sku("Apple AirPods Pro (2nd generation)", "electronics"), "AP-APP-2")

    def test_wrong_generation_is_not_matched(self):
        # Only the 2nd generation is in the catalog; a 1st-generation item must keep the AI price.
        self.assertIsNone(sku("Apple AirPods Pro (1st generation)", "electronics"))
        self.assertIsNone(sku("Apple iPhone 13", "electronics"))

    def test_release_year_is_ignored(self):
        self.assertEqual(sku("Nike Free RN Flyknit 2017 (Team Red)", "apparel"), "NK-FRN-FK-RED")

    def test_generic_and_unknown(self):
        self.assertEqual(sku("Black over-ear wireless headphones", "electronics"), "GEN-OE-HP-BLK")
        self.assertIsNone(sku("Apple iPhone (brown leather case)", "electronics"))  # ambiguous model
        self.assertIsNone(sku("Samsung Galaxy S23", "electronics"))
        self.assertIsNone(sku("Ceramic coffee mug", "other"))
        self.assertIsNone(sku("Nike Air Max 1", "electronics"))  # wrong category


if __name__ == "__main__":
    unittest.main()
