from __future__ import annotations

import re
import time
from abc import ABC, abstractmethod

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError

from catalog import CatalogProduct, classify
from utils import absolute_url, clean_text, extract_capacity, parse_price, stable_key

NORMAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"


class GeneralProductCrawler(ABC):
    store_code: str
    sources: list[str]
    card_selector = ".prod_list li, li.prod_list, .prod_box, .product-list li, .itemWrap, .item-wrap, .item, .goods-list li"

    def __init__(self, request_interval: float = 0.5, retries: int = 1, max_pages: int = 40) -> None:
        self.request_interval = request_interval
        self.retries = retries
        self.max_pages = max_pages
        self.excluded_samples: list[str] = []
        self.pages_seen = 0

    @property
    def source_url(self) -> str:
        return self.sources[0]

    def crawl(self, page: Page) -> list[CatalogProduct]:
        error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                result = self.collect(page)
                deduped = list({(p.source_product_id or p.normalized_name, p.normalized_capacity): p for p in result}.values())
                print(f"{self.store_code}: general pages={self.pages_seen} food_products={len(deduped)} excluded_samples={self.excluded_samples[:8]}")
                return deduped
            except Exception as exc:
                error = exc
                if attempt < self.retries:
                    time.sleep(self.request_interval * (2 ** attempt))
        raise RuntimeError(f"{self.store_code} general crawl failed after limited retries: {error}")

    @abstractmethod
    def collect(self, page: Page) -> list[CatalogProduct]: ...

    def collect_sources(self, page: Page) -> list[CatalogProduct]:
        items: list[CatalogProduct] = []
        for url in self.sources:
            items.extend(self.collect_paginated_cards(page, url))
        return items

    def collect_paginated_cards(self, page: Page, url: str) -> list[CatalogProduct]:
        items: list[CatalogProduct] = []
        seen_page_signatures: set[str] = set()
        for page_num in range(1, self.max_pages + 1):
            next_url = self.page_url(url, page_num)
            try:
                page.set_extra_http_headers({"User-Agent": NORMAL_UA})
                page.goto(next_url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(int(self.request_interval * 1000))
                self.scroll_to_bottom(page)
            except PlaywrightTimeoutError:
                break

            cards = self.extract_cards(page, next_url)
            signature = "|".join(f"{card['name']}:{card['price']}" for card in cards[:8])
            if not cards or signature in seen_page_signatures:
                break
            seen_page_signatures.add(signature)
            self.pages_seen += 1
            page_items = [item for card in cards if (item := self.to_product(card, next_url))]
            if not page_items:
                if page_num > 1:
                    break
                continue
            items.extend(page_items)
            if len(cards) < 8 and page_num > 1:
                break
        return items

    def page_url(self, url: str, page_num: int) -> str:
        return url

    def scroll_to_bottom(self, page: Page) -> None:
        for _ in range(4):
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(180)

    def extract_cards(self, page: Page, source_url: str) -> list[dict]:
        return page.locator(self.card_selector).evaluate_all(
            r"""
            (nodes) => nodes.map((node) => {
              const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
              const name = (node.querySelector('.name,.tit,.product-name,.goods-name,.itemTit,.item_title')?.textContent || '').trim();
              const price = (node.querySelector('.price,.cost,.won,.itemPrice,.goods-price')?.textContent || text).trim();
              const img = node.querySelector('img');
              const link = node.querySelector('a');
              return {
                text,
                name: name || text,
                price,
                image: img?.src || img?.getAttribute('src') || null,
                href: link?.href || link?.getAttribute('href') || null,
                id: node.getAttribute('data-product-id') || node.getAttribute('data-goods-no') || node.getAttribute('data-goods-cd') || null,
              };
            })
            """
        )

    def to_product(self, row: dict, source_url: str) -> CatalogProduct | None:
        raw_name = clean_text(row.get("name") or row.get("text") or "")
        text = clean_text(row.get("text") or raw_name)
        price = parse_price(str(row.get("price") or text))
        name = self.clean_name(raw_name, text)
        if not name or price <= 0:
            return None
        category = classify(name, price)
        if not category:
            if len(self.excluded_samples) < 20:
                self.excluded_samples.append(name)
            return None
        return CatalogProduct(
            self.store_code,
            name,
            price,
            row.get("id") or stable_key(self.store_code, name, str(price)),
            capacity=extract_capacity(name),
            category=category,
            image_url=absolute_url(source_url, row.get("image")),
            source_url=absolute_url(source_url, row.get("href")) or source_url,
        )

    def clean_name(self, raw_name: str, text: str) -> str:
        source = text if raw_name.strip().upper() in {"NEW", "BEST", "SALE", ""} else raw_name
        name = re.sub(r"NEW|신상품|1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|[0-9,]+\s*원", " ", source, flags=re.I)
        name = re.sub(r"\s+", " ", name).strip(" -|/")
        return name[:90]


class CuGeneralProductCrawler(GeneralProductCrawler):
    store_code = "CU"
    sources = ["https://cu.bgfretail.com/product/product.do?category=product&depth2=4&sf=N"]

    def collect(self, page: Page) -> list[CatalogProduct]:
        url = self.sources[0]
        page.set_extra_http_headers({"User-Agent": NORMAL_UA})
        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(1200)
        self.scroll_to_bottom(page)
        previous_count = 0
        for page_num in range(1, self.max_pages + 1):
            current_count = page.locator("li.prod_list").count()
            if current_count <= previous_count:
                break
            previous_count = current_count
            self.pages_seen = page_num
            if page.locator("a", has_text="더보기").count() == 0:
                break
            page.evaluate("page => window.nextPage && window.nextPage(page)", page_num)
            page.wait_for_timeout(900)
            self.scroll_to_bottom(page)
        return [item for card in self.extract_cards(page, url) if (item := self.to_product(card, url))]


class Gs25GeneralProductCrawler(GeneralProductCrawler):
    store_code = "GS25"
    sources = ["https://gs25.gsretail.com/gscvs/ko/products/youus-freshfood?uiel=Desktop"]

    def collect(self, page: Page) -> list[CatalogProduct]:
        url = self.sources[0]
        page.set_extra_http_headers({"User-Agent": NORMAL_UA})
        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(1200)
        self.scroll_to_bottom(page)
        total_pages = self.detect_last_page(page)
        items = self.cards_to_products(page, url)
        self.pages_seen += 1
        for page_num in range(2, min(total_pages, self.max_pages) + 1):
            page.evaluate("page => window.vagelistCommonFn && window.vagelistCommonFn.movePage(page)", page_num)
            page.wait_for_timeout(900)
            self.scroll_to_bottom(page)
            page_items = self.cards_to_products(page, url)
            if not page_items:
                break
            items.extend(page_items)
            self.pages_seen += 1
        return items

    def detect_last_page(self, page: Page) -> int:
        values = page.locator(".paging a").evaluate_all(
            """
            nodes => nodes.map(a => a.getAttribute('onclick') || '')
              .map(text => (text.match(/movePage\\((\\d+)\\)/) || [])[1])
              .filter(Boolean)
              .map(Number)
            """
        )
        return max(values) if values else 1

    def cards_to_products(self, page: Page, url: str) -> list[CatalogProduct]:
        return [item for card in self.extract_cards(page, url) if (item := self.to_product(card, url))]


class Emart24GeneralProductCrawler(GeneralProductCrawler):
    store_code = "EMART24"
    sources = ["https://emart24.co.kr/goods/ff"]
    max_pages = 12

    def page_url(self, url: str, page_num: int) -> str:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}page={page_num}"

    def collect(self, page: Page) -> list[CatalogProduct]:
        return self.collect_sources(page)
GENERAL_CRAWLERS = {c.store_code: c() for c in (CuGeneralProductCrawler, Gs25GeneralProductCrawler, Emart24GeneralProductCrawler)}





