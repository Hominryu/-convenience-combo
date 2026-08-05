from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

from catalog import CatalogProduct, identity_match, to_db_category
from models import Product
from sync import sync_catalog
from utils import extract_capacity

STORE_CODE = {
    "cu": "CU",
    "gs25": "GS25",
    "emart24": "EMART24",
}

CATEGORY_MAP = {
    "meal": "MAIN_MEAL",
    "noodle": "RAMEN",
    "fresh": "SIDE",
    "side": "SIDE",
    "protein": "SIDE",
    "salad": "SIDE",
    "snack": "SNACK",
    "drink": "DRINK",
    "dessert": "DESSERT",
}

PROMOTION_MAP = {
    "none": "NONE",
    "1+1": "ONE_PLUS_ONE",
    "2+1": "TWO_PLUS_ONE",
    "3+1": "THREE_PLUS_ONE",
    "sale": "SALE",
    "gift": "GIFT",
    "new": "NEW",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseClient:
    def __init__(self) -> None:
        supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not supabase_url or not service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when --upload is used")

        self.base_url = supabase_url.rstrip("/")
        self.key = service_role_key
        self.rest_url = f"{self.base_url}/rest/v1"
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = requests.request(method, f"{self.rest_url}/{path}", headers={**self.headers, **kwargs.pop("headers", {})}, timeout=60, **kwargs)
        if not response.ok:
            raise RuntimeError(f"Supabase {response.status_code}: {response.text[:1000]}")
        if response.status_code == 204 or not response.text:
            return None
        return response.json()

    def find_product_by_source(self, store_code: str, source_product_id: str) -> dict | None:
        rows = self.request(
            "GET",
            f"products?store_code=eq.{store_code}&source_product_id=eq.{source_product_id}&select=id&limit=1",
        ) or []
        return rows[0] if rows else None

    def begin_run(self, store_code: str, crawl_type: str) -> str:
        rows = self.request(
            "POST",
            "crawl_runs",
            headers={"Prefer": "return=representation"},
            json={"store_code": store_code, "crawl_type": crawl_type, "status": "RUNNING"},
        )
        return rows[0]["id"]

    def finish_run(self, run_id: str, status: str, counts: dict, error: str | None = None) -> None:
        self.request(
            "PATCH",
            f"crawl_runs?id=eq.{run_id}",
            json={
                "status": status,
                "collected_count": counts.get("collected", 0),
                "inserted_count": counts.get("inserted", 0),
                "updated_count": counts.get("updated", 0),
                "deactivated_count": counts.get("deactivated", 0),
                "error_message": error,
                "finished_at": utc_now(),
            },
        )

    def products_for_store(self, store_code: str) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        limit = 1000
        while True:
            page = self.request(
                "GET",
                f"products?store_code=eq.{store_code}&select=id,store_code,source_product_id,normalized_name,capacity&limit={limit}&offset={offset}",
            ) or []
            rows.extend(page)
            if len(page) < limit:
                return rows
            offset += limit

    def deactivate_missing_promotions(self, store_code: str, run_id: str) -> int:
        rows: list[dict] = []
        offset = 0
        limit = 1000
        while True:
            page = self.request(
                "GET",
                f"products?store_code=eq.{store_code}&select=id&limit={limit}&offset={offset}",
            ) or []
            rows.extend(page)
            if len(page) < limit:
                break
            offset += limit
        product_ids = [row["id"] for row in rows if row.get("id")]
        updated = 0
        for start in range(0, len(product_ids), 80):
            chunk = product_ids[start:start + 80]
            if not chunk:
                continue
            ids = ",".join(chunk)
            result = self.request(
                "PATCH",
                f"promotions?product_id=in.({ids})&is_active=eq.true&last_seen_run_id=neq.{run_id}",
                headers={"Prefer": "return=representation"},
                json={"is_active": False},
            ) or []
            updated += len(result)
        return updated

    def upsert_product(self, row: dict) -> bool:
        product_id = row.pop("id", None)
        if product_id:
            self.request("PATCH", f"products?id=eq.{product_id}", json=row)
            row["id"] = product_id
            return False

        if row.get("source_product_id"):
            source_product_id = row["source_product_id"]
            try:
                rows = self.request(
                    "POST",
                    "products?on_conflict=store_code,source_product_id",
                    headers={"Prefer": "resolution=merge-duplicates,return=representation"},
                    json=row,
                )
                row["id"] = rows[0]["id"]
            except RuntimeError as error:
                if "23505" not in str(error):
                    raise
                existing = self.find_product_by_source(row["store_code"], source_product_id)
                if not existing:
                    raise
                product_id = existing["id"]
                self.request("PATCH", f"products?id=eq.{product_id}", json=row)
                row["id"] = product_id
            return False

        rows = self.request("POST", "products", headers={"Prefer": "return=representation"}, json=row)
        row["id"] = rows[0]["id"]
        return True

    def sync_general(self, store_code: str, items: list) -> dict:
        return sync_catalog(self, store_code, items, complete=True)

    def save_products(self, items: list[Product]) -> dict[str, int]:
        if not items:
            return {"products": 0, "promotions": 0}

        store_code = STORE_CODE[items[0].retailerCode]
        run_id = self.begin_run(store_code, "PROMOTION")
        now = utc_now()
        existing = self.products_for_store(store_code)
        product_id_by_source: dict[str, str] = {}
        inserted = updated = 0

        deduped_items = list({item.externalKey: item for item in items}.values())
        for item in deduped_items:
            catalog_item = CatalogProduct(
                store_code=STORE_CODE[item.retailerCode],
                original_name=item.name,
                price=item.price,
                source_product_id=item.externalKey,
                brand_name=item.brand,
                capacity=extract_capacity(item.name),
                category=item.category if item.category in CATEGORY_MAP else "snack",
                image_url=item.imageUrl,
            )
            matched = identity_match(existing, catalog_item)
            row = {
                "id": matched.get("id") if matched else None,
                "store_code": STORE_CODE[item.retailerCode],
                "source_product_id": item.externalKey or (matched.get("source_product_id") if matched else None),
                "original_name": item.name,
                "normalized_name": item.normalizedName,
                "brand_name": item.brand,
                "capacity": catalog_item.normalized_capacity,
                "category": CATEGORY_MAP.get(item.category, to_db_category(catalog_item.category)),
                "price": item.price,
                "image_url": item.imageUrl,
                "source_url": None,
                "is_active": True,
                "last_seen_run_id": run_id,
                "last_seen_at": now,
                "last_seen_promotion_at": now,
                "price_verified_at": now,
                "promotion_end_at": item.endDate,
            }
            created = self.upsert_product(row)
            inserted += int(created)
            updated += int(not created)
            product_id = row.get("id") or (matched.get("id") if matched else None)
            if product_id:
                product_id_by_source[item.externalKey] = product_id
            if created and product_id:
                existing.append({
                    "id": product_id,
                    "store_code": STORE_CODE[item.retailerCode],
                    "source_product_id": item.externalKey,
                    "normalized_name": item.normalizedName,
                    "capacity": catalog_item.normalized_capacity,
                })

        promotion_rows = []
        for item in deduped_items:
            product_id = product_id_by_source.get(item.externalKey)
            if not product_id:
                continue
            promo_type = PROMOTION_MAP.get(item.promotionType, "NONE")
            if promo_type == "NONE":
                continue
            promotion_rows.append({
                "product_id": product_id,
                "promotion_type": promo_type,
                "purchase_quantity": item.purchaseQuantity,
                "reward_quantity": item.rewardQuantity,
                "promotion_price": item.discountPrice if item.discountPrice is not None else item.price,
                "start_date": item.startDate,
                "end_date": item.endDate,
                "is_active": True,
                "last_seen_run_id": run_id,
                "last_seen_at": now,
            })

        if promotion_rows:
            self.request(
                "POST",
                "promotions?on_conflict=product_id,promotion_type,start_date,end_date",
                headers={"Prefer": "resolution=merge-duplicates,return=representation"},
                json=promotion_rows,
            )

        deactivated = self.deactivate_missing_promotions(store_code, run_id)
        self.finish_run(run_id, "SUCCESS", {"collected": len(items), "inserted": inserted, "updated": updated, "deactivated": deactivated})
        return {"products": inserted + updated, "promotions": len(promotion_rows), "deactivated": deactivated}

    def save_run(self, retailer: str, status: str, fetched_count: int, saved: dict[str, int] | None = None, error: str | None = None, started_at: str | None = None) -> None:
        return None






