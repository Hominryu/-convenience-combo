from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from general_crawlers import GENERAL_CRAWLERS
from supabase_upload import SupabaseClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Independent general product crawler")
    parser.add_argument("--store", choices=["all", "CU", "GS25", "EMART24"], default="all")
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--output", default="crawler/output/general-latest.json")
    args = parser.parse_args()
    targets = list(GENERAL_CRAWLERS) if args.store == "all" else [args.store]
    client = SupabaseClient() if args.upload else None
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "results": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(locale="ko-KR")
        for store in targets:
            page = context.new_page()
            try:
                items = GENERAL_CRAWLERS[store].crawl(page)
                if not items:
                    raise RuntimeError("zero verified products; refusing to deactivate existing data")
                saved = client.sync_general(store, items) if client else {"collected": len(items), "status": "DRY_RUN"}
                report["results"].append({"store": store, **saved, "source": GENERAL_CRAWLERS[store].source_url})
                print(f"{store}: {saved}")
            except Exception as exc:
                report["results"].append({"store": store, "status": "FAILED", "error": str(exc)})
                print(f"{store}: FAILED {exc}")
            finally:
                page.close()
        browser.close()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if any(row["status"] == "FAILED" for row in report["results"]):
        raise SystemExit(1)


if __name__ == "__main__": main()
