from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests

from models import Product

RETAILERS = {
    "cu": "CU",
    "gs25": "GS25",
    "seven": "세븐일레븐",
    "emart24": "이마트24",
}


class SupabaseClient:
    def __init__(self) -> None:
        self.base_url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
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
