from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from crawlers import CRAWLERS
from models import RetailerCode
from supabase_upload import SupabaseClient


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convenience store promotion crawler")
    parser.add_argument("--retailer", choices=["all", "cu", "gs25", "seven", "emart24"], default="all")
    parser.add_argument("--upload", action="store_true", help="Upload collected products to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print collection summary without upload")
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode")
    parser.add_argument("--output", default="crawler/output/latest.json")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    targets: list[RetailerCode] = list(CRAWLERS.keys()) if args.retailer == "all" else [args.retailer]
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    uploader = SupabaseClient() if args.upload else None
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "results": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(
            locale="ko-KR",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 convenience-combo-crawler/1.0",
            viewport={"width": 1366, "height": 1600},
        )

        for retailer in targets:
            started_at = datetime.now(timezone.utc).isoformat()
            page = context.new_page()
            try:
                items = CRAWLERS[retailer](page)
                saved = uploader.save_products(items) if uploader else {"products": 0, "promotions": 0}
                if uploader:
                    uploader.save_run(retailer, "success", len(items), saved, started_at=started_at)
                result = {
                    "retailer": retailer,
                    "fetched": len(items),
                    "saved": saved,
                    "examples": [item.to_dict() for item in items[:3]],
                }
                print(f"{retailer}: fetched={len(items)} saved={saved}")
            except Exception as error:
                if uploader:
                    uploader.save_run(retailer, "failed", 0, error=str(error), started_at=started_at)
                result = {"retailer": retailer, "fetched": 0, "error": str(error)}
                print(f"{retailer}: ERROR {error}")
            finally:
                page.close()
            report["results"].append(result)

        context.close()
        browser.close()

    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.dry_run or not args.upload:
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
