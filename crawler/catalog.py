from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable

from utils import extract_capacity, normalize_name

CATEGORIES = {
    "MAIN_MEAL", "RAMEN", "RICE", "SANDWICH", "SIDE", "SNACK",
    "DRINK", "COFFEE", "DESSERT", "ALCOHOL_SIDE", "ETC",
}

RULES = [
    ("RAMEN", r"라면|우동|국수|면"),
    ("RICE", r"김밥|주먹밥|삼각|볶음밥|덮밥"),
    ("SANDWICH", r"샌드위치|샌드|버거|토스트"),
    ("MAIN_MEAL", r"도시락|정식|파스타"),
    ("COFFEE", r"커피|아메리카노|라떼|에스프레소"),
    ("DRINK", r"콜라|사이다|음료|주스|생수|우유|차"),
    ("DESSERT", r"케이크|아이스크림|푸딩|요거트"),
    ("ALCOHOL_SIDE", r"육포|먹태|오징어|안주"),
    ("SNACK", r"과자|칩|초콜릿|쿠키|젤리|캔디"),
    ("SIDE", r"계란|핫바|소시지|만두|떡볶이"),
]


def classify_by_rule(name: str) -> str | None:
    return next((category for category, pattern in RULES if re.search(pattern, name, re.I)), None)


def classify(name: str, price: int, gemini: Callable[[str], str] | None = None) -> str:
    ruled = classify_by_rule(name)
    if ruled:
        return ruled
    if gemini is None:
        return "ETC"
    # Gemini can return only a category; original product fields never enter its output path.
    result = gemini(json.dumps({"name": name, "price": price}, ensure_ascii=False)).strip().upper()
    return result if result in CATEGORIES else "ETC"


@dataclass(frozen=True)
class CatalogProduct:
    store_code: str
    original_name: str
    price: int
    source_product_id: str | None = None
    brand_name: str | None = None
    capacity: str | None = None
    category: str = "ETC"
    image_url: str | None = None
    source_url: str | None = None

    def __post_init__(self) -> None:
        if self.store_code not in {"CU", "GS25", "EMART24"}:
            raise ValueError("unsupported store")
        if not self.original_name or self.price <= 0:
            raise ValueError("name and positive price are required")

    @property
    def normalized_name(self) -> str:
        return normalize_name(self.original_name)

    @property
    def normalized_capacity(self) -> str | None:
        return self.capacity or extract_capacity(self.original_name)


def identity_match(existing: list[dict], item: CatalogProduct) -> dict | None:
    if item.source_product_id:
        found = next((row for row in existing if row.get("store_code") == item.store_code and row.get("source_product_id") == item.source_product_id), None)
        if found:
            return found
    return next((row for row in existing if row.get("store_code") == item.store_code
                 and row.get("normalized_name") == item.normalized_name
                 and (row.get("capacity") or None) == item.normalized_capacity), None)
