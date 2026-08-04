from __future__ import annotations

import time
from abc import ABC, abstractmethod

from playwright.sync_api import Page

from catalog import CatalogProduct, classify
from utils import clean_text, extract_capacity, parse_price, stable_key


class GeneralProductCrawler(ABC):
    store_code: str
    source_url: str

    def __init__(self, request_interval: float = 0.6, retries: int = 2) -> None:
        self.request_interval = request_interval
        self.retries = retries

    def crawl(self, page: Page) -> list[CatalogProduct]:
        error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                result = self.collect(page)
                return list({(p.source_product_id or p.normalized_name, p.normalized_capacity): p for p in result}.values())
            except Exception as exc:
                error = exc
                if attempt < self.retries:
                    time.sleep(self.request_interval * (2 ** attempt))
        raise RuntimeError(f"{self.store_code} general crawl failed after limited retries: {error}")

    @abstractmethod
    def collect(self, page: Page) -> list[CatalogProduct]: ...

    def from_cards(self, page: Page, selector: str) -> list[CatalogProduct]:
        page.goto(self.source_url, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_timeout(int(self.request_interval * 1000))
        cards = page.locator(selector).evaluate_all("""nodes => nodes.map(n => ({
          name: (n.querySelector('.name,.tit,.product-name')?.textContent || '').trim(),
          price: (n.querySelector('.price,.cost')?.textContent || '').trim(),
          image: n.querySelector('img')?.src || null,
          href: n.querySelector('a')?.href || null,
          id: n.getAttribute('data-product-id') || n.getAttribute('data-goods-no') || null
        }))""")
        result = []
        for row in cards:
            name, price = clean_text(row["name"]), parse_price(row["price"])
            if name and price:
                result.append(CatalogProduct(self.store_code, name, price, row["id"] or stable_key(self.store_code, name),
                                             capacity=extract_capacity(name), category=classify(name, price),
                                             image_url=row["image"], source_url=row["href"] or self.source_url))
        return result


class CuGeneralProductCrawler(GeneralProductCrawler):
    store_code, source_url = "CU", "https://cu.bgfretail.com/product/product.do?category=product&depth2=4"
    def collect(self, page: Page) -> list[CatalogProduct]: return self.from_cards(page, ".prod_list li, li.prod_list")


class Gs25GeneralProductCrawler(GeneralProductCrawler):
    store_code, source_url = "GS25", "https://gs25.gsretail.com/gscvs/ko/products/youus-freshfood"
    def collect(self, page: Page) -> list[CatalogProduct]: return self.from_cards(page, ".prod_box, .product-list li")


class Emart24GeneralProductCrawler(GeneralProductCrawler):
    store_code, source_url = "EMART24", "https://emart24.co.kr/goods/normal"
    def collect(self, page: Page) -> list[CatalogProduct]: return self.from_cards(page, ".itemWrap, .item-wrap")


GENERAL_CRAWLERS = {c.store_code: c() for c in (CuGeneralProductCrawler, Gs25GeneralProductCrawler, Emart24GeneralProductCrawler)}
