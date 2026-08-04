from __future__ import annotations

import re
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError

from models import Product, RetailerCode, now_iso
from utils import absolute_url, clean_text, infer_category_tags, infer_promotion, month_range, normalize_name, parse_price, stable_key

WON = "\uc6d0"
NEW_PRODUCT = "\uc2e0\uc0c1\ud488"
EVENT = "\ud589\uc0ac"
EMART24 = "\uc774\ub9c8\ud2b824"
SEVEN = "\uc138\ube10\uc77c\ub808\ube10"


def _product(
    retailer: RetailerCode,
    brand: str,
    name: str,
    price: int,
    promotion_raw: str,
    image_url: str | None = None,
    external_seed: str | None = None,
) -> Product | None:
    name = clean_text(name)
    if not name or price <= 0:
        return None

    promotion_type, purchase_quantity, reward_quantity = infer_promotion(promotion_raw)
    category, tags = infer_category_tags(name, promotion_type)
    start_date, end_date = month_range()
    return Product(
        retailerCode=retailer,
        externalKey=stable_key(retailer, external_seed or name, str(price), promotion_type),
        brand=brand,
        name=name,
        normalizedName=normalize_name(name),
        price=price,
        category=category,
        tags=tags,
        imageUrl=image_url,
        promotionType=promotion_type,
        purchaseQuantity=purchase_quantity,
        rewardQuantity=reward_quantity,
        discountPrice=None,
        startDate=start_date,
        endDate=end_date,
        collectedAt=now_iso(),
        isNew=bool(re.search(rf"NEW|{NEW_PRODUCT}", promotion_raw, re.I)),
    )


def _dedupe(items: list[Product]) -> list[Product]:
    return list({item.externalKey: item for item in items}.values())


def _first_match(pattern: str, text: str) -> str:
    match = re.search(pattern, text)
    return match[1] if match else ""


def crawl_cu(page: Page) -> list[Product]:
    page.goto("https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N", wait_until="domcontentloaded", timeout=60000)
    items: list[Product] = []

    for promo_code, promo_raw in [("23", "1+1"), ("24", "2+1"), ("", "")]:
        for page_index in range(1, 11):
            response = page.request.post(
                "https://cu.bgfretail.com/event/plusAjax.do",
                form={"pageIndex": str(page_index), "listType": "0", "searchCondition": promo_code},
                headers={
                    "Referer": "https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N",
                    "X-Requested-With": "XMLHttpRequest",
                },
                timeout=60000,
            )
            if not response.ok:
                break
            html = response.text()
            blocks = re.findall(r"<li[\s\S]*?</li>", html)
            page_items: list[Product] = []
            for block in blocks:
                name = clean_text(_first_match(r'class=["\'][^"\']*prodName[^"\']*["\'][^>]*>([\s\S]*?)</p>', block))
                text = clean_text(block)
                if not name:
                    name = re.sub(rf"1\+1|2\+1|3\+1|NEW|BEST|{EVENT}|{NEW_PRODUCT}|[0-9,]+\s*{WON}", " ", text).strip()
                price = parse_price(_first_match(rf"([0-9,]+)\s*{WON}", text))
                image = _first_match(r'<img[^>]+src=["\']([^"\']+)["\']', block)
                product = _product("cu", "CU", name, price, promo_raw or text, absolute_url("https://cu.bgfretail.com", image))
                if product:
                    page_items.append(product)
            if not page_items:
                break
            items.extend(page_items)

    return _dedupe(items)


def crawl_gs25(page: Page) -> list[Product]:
    url = "https://gs25.gsretail.com/gscvs/ko/products/event-goods"
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1200)

    items = page.locator("li:has(.prod_box)").evaluate_all(
        """
        (nodes) => nodes.map((node) => {
          const name = node.querySelector('.tit')?.textContent?.trim() || node.querySelector('img')?.getAttribute('alt') || '';
          const price = node.querySelector('.cost')?.textContent?.trim() || '';
          const promo = node.querySelector('.flag_box')?.textContent?.trim() || '';
          const imageUrl = node.querySelector('img')?.src || '';
          return { name, price, promo, imageUrl };
        })
        """
    )

    parsed: list[Product] = []
    for item in items:
        product = _product("gs25", "GS25", item.get("name", ""), parse_price(item.get("price", "")), item.get("promo", ""), item.get("imageUrl"))
        if product:
            parsed.append(product)
    return _dedupe(parsed)


def crawl_emart24(page: Page) -> list[Product]:
    page.goto("https://emart24.co.kr/goods/event?align=PRICE_DESC&base_category_seq=2&category_seq=1&search=", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1200)
    parsed: list[Product] = []

    for page_no in range(1, 21):
        cards = page.locator(".itemWrap").evaluate_all(
            """
            (nodes) => nodes.map((node) => {
              const text = node.textContent || '';
              const imageUrl = node.querySelector('img')?.src || '';
              return { text, imageUrl };
            })
            """
        )
        before = len(parsed)
        for card in cards:
            text = clean_text(card.get("text", ""))
            price = parse_price(_first_match(rf"([0-9,]+)\s*{WON}", text))
            name = re.sub(rf"NEW|{NEW_PRODUCT}|1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|[0-9,]+\s*{WON}", " ", text).strip()
            product = _product("emart24", EMART24, name, price, text, card.get("imageUrl"))
            if product:
                parsed.append(product)
        if len(parsed) == before:
            break
        next_link = page.locator(f"a:has-text('{page_no + 1}')")
        if next_link.count() != 1:
            break
        try:
            next_link.click(timeout=3000)
            page.wait_for_timeout(800)
        except PlaywrightTimeoutError:
            break

    return _dedupe(parsed)


def crawl_seven(page: Page) -> list[Product]:
    candidates = [
        "https://www.7-eleven.co.kr/product/presentList.asp",
        "http://www.7-eleven.co.kr/product/presentList.asp",
    ]
    last_error: Exception | None = None
    for url in candidates:
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)
            break
        except Exception as error:
            last_error = error
    else:
        if last_error:
            raise last_error

    cards = page.locator("li").evaluate_all(
        """
        (nodes) => nodes.map((node) => {
          const text = node.textContent || '';
          const imageUrl = node.querySelector('img')?.src || '';
          return { text, imageUrl };
        })
        """
    )

    parsed: list[Product] = []
    for card in cards:
        text = clean_text(card.get("text", ""))
        if not re.search(rf"1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|{WON}", text):
            continue
        price = parse_price(_first_match(rf"([0-9,]+)\s*{WON}", text))
        name = re.sub(rf"1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|NEW|{NEW_PRODUCT}|[0-9,]+\s*{WON}", " ", text).strip()
        product = _product("seven", SEVEN, name, price, text, card.get("imageUrl"))
        if product:
            parsed.append(product)
    return _dedupe(parsed)


CRAWLERS: dict[RetailerCode, Callable[[Page], list[Product]]] = {
    "cu": crawl_cu,
    "gs25": crawl_gs25,
    "seven": crawl_seven,
    "emart24": crawl_emart24,
}
