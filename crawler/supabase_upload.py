from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

from models import Product
from sync import sync_catalog

STORE_CODE = {
    "cu": "CU",
    "gs25": "GS25",
    "emart24": "EMART24",
}

CATEGORY_MAP = {
    "meal": "MAIN_MEAL",
    "fresh": "SIDE",
    "protein": "SIDE",
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
        return self.request("GET", f"products?store_code=eq.{store_code}&select=id,store_code,source_product_id,normalized_name,capacity")

    def upsert_product(self, row: dict) -> bool:
        product_id = row.pop("id", None)
        if product_id:
            self.request("PATCH", f"products?id=eq.{product_id}", json=row)
            return False
        self.request("POST", "products", json=row)
        return True

    def deactivate_missing(self, store_code: str, run_id: str) -> int:
        rows = self.request(
            "PATCH",
            f"products?store_code=eq.{store_code}&is_active=eq.true&last_seen_run_id=not.eq.{run_id}",
            headers={"Prefer": "return=representation"},
            json={"is_active": False},
        ) or []
        return len(rows)

    def sync_general(self, store_code: str, items: list) -> dict:
        return sync_catalog(self, store_code, items, complete=True)

    def save_products(self, items: list[Product]) -> dict[str, int]:
        if not items:
            return {"products": 0, "promotions": 0}

        store_code = STORE_CODE[items[0].retailerCode]
        run_id = self.begin_run(store_code, "PROMOTION")
        now = utc_now()
        product_rows = []
        for item in items:
            product_rows.append({
                "store_code": STORE_CODE[item.retailerCode],
                "source_product_id": item.externalKey,
                "original_name": item.name,
                "normalized_name": item.normalizedName,
                "brand_name": item.brand,
                "capacity": None,
                "category": CATEGORY_MAP.get(item.category, "ETC"),
                "price": item.price,
                "image_url": item.imageUrl,
                "source_url": None,
                "is_active": True,
                "last_seen_run_id": run_id,
                "last_seen_at": now,
            })

        saved_products = self.request(
            "POST",
            "products?on_conflict=store_code,source_product_id",
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=product_rows,
        )
        product_id_by_source = {row["source_product_id"]: row["id"] for row in saved_products}

        promotion_rows = []
        for item in items:
            product_id = product_id_by_source.get(item.externalKey)
            if not product_id:
                continue
            promo_type = PROMOTION_MAP.get(item.promotionType, "NONE")
            promotion_rows.append({
                "product_id": product_id,
                "promotion_type": promo_type,
                "purchase_quantity": item.purchaseQuantity,
                "reward_quantity": item.rewardQuantity,
                "promotion_price": item.discountPrice if item.discountPrice is not None else item.price,
                "start_date": item.startDate,
                "end_date": item.endDate,
                "is_active": promo_type != "NONE",
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

        self.finish_run(run_id, "SUCCESS", {"collected": len(items), "inserted": len(product_rows), "updated": 0, "deactivated": 0})
        return {"products": len(product_rows), "promotions": len(promotion_rows)}

    def save_run(self, retailer: str, status: str, fetched_count: int, saved: dict[str, int] | None = None, error: str | None = None, started_at: str | None = None) -> None:
        # Kept as a no-op compatibility hook for run.py. save_products records the canonical crawl run.
        return None
