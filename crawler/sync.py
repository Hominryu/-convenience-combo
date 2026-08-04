from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol

from catalog import CatalogProduct, identity_match


class CatalogRepository(Protocol):
    def begin_run(self, store_code: str, crawl_type: str) -> str: ...
    def products_for_store(self, store_code: str) -> list[dict]: ...
    def upsert_product(self, row: dict) -> bool: ...
    def deactivate_missing(self, store_code: str, run_id: str) -> int: ...
    def finish_run(self, run_id: str, status: str, counts: dict, error: str | None = None) -> None: ...


def sync_catalog(repo: CatalogRepository, store_code: str, items: list[CatalogProduct], complete: bool = True) -> dict:
    run_id = repo.begin_run(store_code, "GENERAL")
    now = datetime.now(timezone.utc).isoformat()
    existing = repo.products_for_store(store_code)
    inserted = updated = 0
    try:
        for item in items:
            matched = identity_match(existing, item)
            row = {
                "id": matched.get("id") if matched else None,
                "store_code": item.store_code,
                "source_product_id": item.source_product_id,
                "original_name": item.original_name,
                "normalized_name": item.normalized_name,
                "brand_name": item.brand_name,
                "capacity": item.normalized_capacity,
                "category": item.category,
                "price": item.price,
                "image_url": item.image_url,
                "source_url": item.source_url,
                "is_active": True,
                "last_seen_run_id": run_id,
                "last_seen_at": now,
            }
            created = repo.upsert_product(row)
            inserted += int(created)
            updated += int(not created)
        deactivated = repo.deactivate_missing(store_code, run_id) if complete else 0
        status = "SUCCESS" if complete else "PARTIAL_FAILURE"
        counts = {"collected": len(items), "inserted": inserted, "updated": updated, "deactivated": deactivated}
        repo.finish_run(run_id, status, counts)
        return {**counts, "status": status, "run_id": run_id}
    except Exception as exc:
        repo.finish_run(run_id, "FAILED", {"collected": len(items), "inserted": inserted, "updated": updated, "deactivated": 0}, str(exc))
        raise
