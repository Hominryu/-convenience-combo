from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

from models import Product
from sync import sync_catalog

RETAILERS = {
    "cu": "CU",
    "gs25": "GS25",
    "emart24": "\uc774\ub9c8\ud2b824",
}


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

    def ensure_retailers(self) -> dict[str, str]:
        rows = [{"code": code, "name": name} for code, name in RETAILERS.items()]
        self.request(
            "POST",
            "retailers?on_conflict=code",
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=rows,
        )
        saved = self.request("GET", "retailers?select=id,code")
        return {row["code"]: row["id"] for row in saved}

    def save_products(self, items: list[Product]) -> dict[str, int]:
        if not items:
            return {"products": 0, "promotions": 0}

        retailer_map = self.ensure_retailers()
        product_rows = []
        for item in items:
            retailer_id = retailer_map.get(item.retailerCode)
            if not retailer_id:
                continue
            product_rows.append(
                {
                    "retailer_id": retailer_id,
                    "external_key": item.externalKey,
                    "name": item.name,
                    "normalized_name": item.normalizedName,
                    "price": item.price,
                    "category": item.category,
                    "tags": item.tags,
                    "image_url": item.imageUrl,
                    "active": True,
                }
            )

        saved_products = self.request(
            "POST",
            "products?on_conflict=retailer_id,external_key",
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=product_rows,
        )
        product_id_by_key = {f"{row['retailer_id']}:{row['external_key']}": row["id"] for row in saved_products}

        promotion_rows = []
        for item in items:
            retailer_id = retailer_map.get(item.retailerCode)
            product_id = product_id_by_key.get(f"{retailer_id}:{item.externalKey}") if retailer_id else None
            if not product_id:
                continue
            promotion_rows.append(
                {
                    "product_id": product_id,
                    "promotion_type": item.promotionType,
                    "purchase_quantity": item.purchaseQuantity,
                    "reward_quantity": item.rewardQuantity,
                    "discount_price": item.discountPrice,
                    "start_date": item.startDate,
                    "end_date": item.endDate,
                    "collected_at": item.collectedAt,
                }
            )

        self.request("POST", "promotions", json=promotion_rows)
        return {"products": len(product_rows), "promotions": len(promotion_rows)}

    def save_run(self, retailer: str, status: str, fetched_count: int, saved: dict[str, int] | None = None, error: str | None = None, started_at: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.request(
            "POST",
            "crawler_runs",
            json=[
                {
                    "retailer_code": retailer,
                    "status": status,
                    "fetched_count": fetched_count,
                    "saved_products": (saved or {}).get("products", 0),
                    "saved_promotions": (saved or {}).get("promotions", 0),
                    "error_message": error,
                    "started_at": started_at or now,
                    "finished_at": now,
                }
            ],
        )

    def begin_run(self, store_code: str, crawl_type: str) -> str:
        rows = self.request("POST", "crawl_runs", headers={"Prefer": "return=representation"}, json={"store_code": store_code, "crawl_type": crawl_type, "status": "RUNNING"})
        return rows[0]["id"]

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
        rows = self.request("PATCH", f"products?store_code=eq.{store_code}&is_active=eq.true&last_seen_run_id=not.eq.{run_id}", headers={"Prefer": "return=representation"}, json={"is_active": False}) or []
        return len(rows)

    def finish_run(self, run_id: str, status: str, counts: dict, error: str | None = None) -> None:
        self.request("PATCH", f"crawl_runs?id=eq.{run_id}", json={"status": status, "collected_count": counts["collected"], "inserted_count": counts["inserted"], "updated_count": counts["updated"], "deactivated_count": counts["deactivated"], "error_message": error, "finished_at": datetime.now(timezone.utc).isoformat()})

    def sync_general(self, store_code: str, items: list) -> dict:
        return sync_catalog(self, store_code, items, complete=True)
