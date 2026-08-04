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
    parser.add_argument("--retailer", choices=["all", "cu", "gs25", "emart24"], default="all")
    parser.add_argument("--upload", action="store_true", help="Upload collected products to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print collection summary without upload")
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode")
    parser.add_argument("--output", default="crawler/output/latest.json")
    parser.add_argument("--allow-empty", action="store_true", help="Do not fail when a retailer returns zero products")
    return parser.parse_args()


def write_report(output_path: Path, report: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    targets: list[RetailerCode] = ["cu", "gs25", "emart24"] if args.retailer == "all" else [args.retailer]
    output_path = Path(args.output)
    uploader = SupabaseClient() if args.upload else None
    report: dict = {"checkedAt": datetime.now(timezone.utc).isoformat(), "results": []}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not args.headed)
            context = browser.new_context(
                locale="ko-KR",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
                viewport={"width": 1366, "height": 1600},
            )

            for retailer in targets:
                started_at = datetime.now(timezone.utc).isoformat()
                page = context.new_page()
                try:
                    items = CRAWLERS[retailer](page)
                    if not items and not args.allow_empty and retailer != "seven":
                        raise RuntimeError(f"{retailer} crawler returned zero products")
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
    except Exception as error:
        report["fatalError"] = str(error)
        print(f"FATAL: {error}")
    finally:
        write_report(output_path, report)

    print(json.dumps(report, ensure_ascii=False, indent=2))

    failed = bool(report.get("fatalError")) or any("error" in item for item in report["results"])
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
