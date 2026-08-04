import unittest

from catalog import CatalogProduct, classify, identity_match
from combo_engine import Offer, category_balance_score, combinations_for
from sync import sync_catalog
from utils import infer_promotion, normalize_name


class FakeRepo:
    def __init__(self):
        self.rows = [{"id":"old","store_code":"CU","source_product_id":"old","normalized_name":"old","capacity":None,"is_active":True}]
        self.status = None
    def begin_run(self, store_code, crawl_type): return "run-1"
    def products_for_store(self, store_code): return self.rows
    def upsert_product(self, row):
        if row["id"]:
            next(item for item in self.rows if item["id"] == row["id"]).update(row); return False
        row["id"] = "new"; self.rows.append(row); return True
    def deactivate_missing(self, store_code, run_id):
        missing = [r for r in self.rows if r.get("last_seen_run_id") != run_id and r.get("is_active")]
        for row in missing: row["is_active"] = False
        return len(missing)
    def finish_run(self, run_id, status, counts, error=None): self.status = status


class CatalogTests(unittest.TestCase):
    def test_normalize(self): self.assertEqual(normalize_name("(행사) 콜라 1+1 500 ML"), "행사 콜라")
    def test_capacity_separates(self):
        existing = [{"store_code":"CU","source_product_id":None,"normalized_name":"콜라","capacity":"500ml"}]
        self.assertIsNone(identity_match(existing, CatalogProduct("CU", "콜라 1L", 2000)))
    def test_general_promotion_match(self):
        row = {"id":"p","store_code":"GS25","source_product_id":None,"normalized_name":"콜라","capacity":"500ml"}
        self.assertEqual(identity_match([row], CatalogProduct("GS25", "콜라 500ML 1+1", 2200)), row)
    def test_promotion_math(self):
        one = Offer("1","CU","a","DRINK",2000,"ONE_PLUS_ONE")
        two = Offer("2","CU","b","SNACK",1500,"TWO_PLUS_ONE")
        self.assertEqual((one.payment_amount, one.received_quantity), (2000,2))
        self.assertEqual((two.payment_amount, two.received_quantity), (3000,3))
    def test_budget_and_store_boundaries(self):
        items=[Offer("1","CU","a","SNACK",3000),Offer("2","CU","b","DRINK",2500),Offer("3","GS25","c","DRINK",1000)]
        results=combinations_for(items,5000,"SNACK")
        self.assertTrue(all(r["payment_amount"]<=5000 for r in results))
        self.assertTrue(all(len({x.store_code for x in r["items"]})==1 for r in results))
    def test_balance(self):
        balanced=(Offer("1","CU","a","RAMEN",1),Offer("2","CU","b","DRINK",1))
        unbalanced=(Offer("1","CU","a","RAMEN",1),Offer("3","CU","c","RAMEN",1))
        self.assertGreater(category_balance_score(balanced,"MEAL"),category_balance_score(unbalanced,"MEAL"))
    def test_deactivation_only_complete(self):
        repo=FakeRepo(); sync_catalog(repo,"CU",[CatalogProduct("CU","new",1000)],True)
        self.assertFalse(repo.rows[0]["is_active"])
        repo=FakeRepo(); sync_catalog(repo,"CU",[CatalogProduct("CU","new",1000)],False)
        self.assertTrue(repo.rows[0]["is_active"])
    def test_gemini_cannot_create_product(self):
        product=CatalogProduct("CU","미분류",1000)
        self.assertEqual(classify(product.original_name,product.price,lambda _: "FAKE_PRODUCT"),"ETC")
        self.assertEqual(product.original_name,"미분류")
    def test_promotion_regression(self):
        self.assertEqual(infer_promotion("1 + 1"),("1+1",1,2))
        self.assertEqual(infer_promotion("2+1"),("2+1",2,3))


if __name__ == "__main__": unittest.main()
