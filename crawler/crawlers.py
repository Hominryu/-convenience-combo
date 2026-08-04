from __future__ import annotations

import json
import re
import time
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError

from models import Product, RetailerCode, now_iso
from utils import absolute_url, clean_text, infer_category_tags, infer_promotion, month_range, normalize_name, parse_price, stable_key

WON = "\uc6d0"
NEW_PRODUCT = "\uc2e0\uc0c1\ud488"
EVENT = "\ud589\uc0ac"
EMART24 = "\uc774\ub9c8\ud2b824"
SEVEN = "\uc138\ube10\uc77c\ub808\ube10"
NORMAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"


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
                    "User-Agent": NORMAL_UA,
                },
                timeout=8000,
            )
            if not response.ok:
                break
            html = response.text()
            blocks = re.findall(r'<li[^>]+class=["\'][^"\']*prod_list[^"\']*["\'][\s\S]*?</li>', html)
            page_items: list[Product] = []
            for block in blocks:
                name = clean_text(_first_match(r'<div class=["\']name["\']>\s*<p>([\s\S]*?)</p>', block))
                text = clean_text(block)
                price = parse_price(_first_match(r'<div class=["\']price["\']>\s*<strong>([0-9,]+)</strong>', block) or _first_match(rf"([0-9,]+)\s*{WON}", text))
                image = _first_match(r'<img[^>]+src=["\']([^"\']+)["\']', block)
                product = _product("cu", "CU", name, price, promo_raw or text, absolute_url("https://cu.bgfretail.com", image))
                if product:
                    page_items.append(product)
            if not page_items:
                break
            items.extend(page_items)

    return _dedupe(items)


def crawl_gs25(page: Page) -> list[Product]:
    page.goto("https://gs25.gsretail.com/gscvs/ko/products/event-goods", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1200)
    body_text = page.locator("body").inner_text(timeout=5000)
    if "검색 로봇" in body_text or "차단" in body_text:
        raise RuntimeError("GS25 blocked the request as bot traffic")

    csrf = _first_match(r"CSRFToken=([0-9a-fA-F-]+)", page.content())
    if not csrf:
        csrf = _first_match(r"CSRFToken\s*=\s*['\"]([^'\"]+)", page.content())
    search_url = f"http://gs25.gsretail.com/gscvs/ko/products/event-goods-search?CSRFToken={csrf}"
    event_types = [("ONE_TO_ONE", "1+1"), ("TWO_TO_ONE", "2+1"), ("GIFT", "gift")]
    parsed: list[Product] = []

    for parameter, fallback_promo in event_types:
        for page_num in range(1, 40):
            response = page.request.post(
                search_url,
                form={
                    "pageNum": str(page_num),
                    "pageSize": "100",
                    "searchType": "",
                    "searchWord": "",
                    "parameterList": parameter,
                },
                headers={
                    "Referer": "http://gs25.gsretail.com/gscvs/ko/products/event-goods",
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": NORMAL_UA,
                },
                timeout=60000,
            )
            if not response.ok:
                break
            payload = response.json()
            if isinstance(payload, str):
                payload = json.loads(payload)
            rows = payload.get("results", []) if isinstance(payload, dict) else []
            if not rows:
                break
            for row in rows:
                name = str(row.get("goodsNm") or "")
                price = int(float(row.get("price") or 0))
                promo = str(row.get("eventTypeNm") or fallback_promo)
                image = row.get("attFileNm") or row.get("attFileNmOld")
                seed = str(row.get("attFileId") or row.get("goodsNm") or name)
                product = _product("gs25", "GS25", name, price, promo, str(image) if image else None, seed)
                if product:
                    parsed.append(product)
            pagination = payload.get("pagination", {}) if isinstance(payload, dict) else {}
            total_pages = int(pagination.get("numberOfPages") or pagination.get("totalPages") or 0)
            if total_pages and page_num >= total_pages:
                break
            if len(rows) < 100:
                break

    return _dedupe(parsed)


def crawl_emart24(page: Page) -> list[Product]:
    parsed: list[Product] = []
    base_categories = ["1", "2", "5", "3"]
    benefit_categories = ["1", "2", "3", "4", "12"]

    for base_category in base_categories:
        for benefit_category in benefit_categories:
            url = f"https://emart24.co.kr/goods/event?search=&category_seq={benefit_category}&base_category_seq={base_category}&align=PRICE_DESC"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(900)
            except PlaywrightTimeoutError:
                continue

            cards = page.locator(".itemWrap").evaluate_all(
                """
                (nodes) => nodes.map((node) => {
                  const text = node.textContent || '';
                  const imageUrl = node.querySelector('img')?.src || '';
                  return { text, imageUrl };
                })
                """
            )
            for card in cards:
                text = clean_text(card.get("text", ""))
                price = parse_price(_first_match(rf"([0-9,]+)\s*{WON}", text))
                name = re.sub(rf"NEW|{NEW_PRODUCT}|1\s*\+\s*1|2\s*\+\s*1|3\s*\+\s*1|[0-9,]+\s*{WON}", " ", text).strip()
                product = _product("emart24", EMART24, name, price, text, card.get("imageUrl"))
                if product:
                    parsed.append(product)

    return _dedupe(parsed)


def _parse_seven_fragment(html: str, fallback_promo: str) -> list[Product]:
    parsed: list[Product] = []
    blocks = re.findall(r"<li>\s*<ul class=\"tag_list_01\">[\s\S]*?</li>\s*</ul>[\s\S]*?</li>", html)
    if not blocks:
        blocks = re.findall(r"<li>[\s\S]*?pic_product[\s\S]*?</li>", html)
    for block in blocks:
        if "pic_product" not in block:
            continue
        promo = clean_text(_first_match(r'class=["\'][^"\']*ico_tag_[^"\']*["\'][^>]*>([\s\S]*?)</li>', block)) or fallback_promo
        name = clean_text(_first_match(r'class=["\']name["\'][^>]*>([\s\S]*?)</div>', block))
        price = parse_price(_first_match(r'class=["\']price["\'][^>]*>\s*<span>([\s\S]*?)</span>', block))
        image = _first_match(r'<img[^>]+src=["\']([^"\']+)["\']', block)
        product = _product("seven", SEVEN, name, price, promo, absolute_url("https://www.7-eleven.co.kr", image))
        if product:
            parsed.append(product)
    return parsed


def crawl_seven(page: Page) -> list[Product]:
    parsed: list[Product] = []
    tabs = [("1", "1+1"), ("2", "2+1"), ("3", "gift"), ("4", "sale")]
    for tab, fallback_promo in tabs:
        empty_pages = 0
        previous_count = -1
        deadline = time.monotonic() + 28
        for page_index in range(1, 35):
            if time.monotonic() >= deadline:
                break
            try:
                response = page.request.post(
                    "https://www.7-eleven.co.kr/product/listMoreAjax.asp",
                    form={
                        "intPageSize": "10",
                        "intCurrPage": str(page_index),
                        "cateCd1": "",
                        "cateCd2": "",
                        "cateCd3": "",
                        "pTab": tab,
                    },
                    headers={
                        "Referer": "https://www.7-eleven.co.kr/product/presentList.asp",
                        "X-Requested-With": "XMLHttpRequest",
                        "User-Agent": NORMAL_UA,
                    },
                    timeout=8000,
                )
            except PlaywrightTimeoutError:
                break
            if not response.ok:
                break
            html = response.text()
            page_items = _parse_seven_fragment(html, fallback_promo)
            list_count_text = _first_match(r'id=["\']listCnt["\'][^>]*value=["\']([^"\']+)', html)
            list_count = parse_price(list_count_text)
            if not page_items:
                empty_pages += 1
                if empty_pages >= 1:
                    break
                continue
            empty_pages = 0
            parsed.extend(page_items)
            if len(page_items) < 10 or list_count == previous_count:
                break
            previous_count = list_count
    return _dedupe(parsed)

CRAWLERS: dict[RetailerCode, Callable[[Page], list[Product]]] = {
    "cu": crawl_cu,
    "gs25": crawl_gs25,
    "seven": crawl_seven,
    "emart24": crawl_emart24,
}
