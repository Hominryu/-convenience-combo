from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable

from utils import extract_capacity, normalize_name

CATEGORIES = {
    "meal", "noodle", "side", "protein", "salad", "drink", "snack", "dessert",
}

EXCLUDE_RULES = [
    r"담배|궐련|전자담배|라이터|재떨이",
    r"맥주|소주|와인|위스키|막걸리|칵테일|하이볼|주류|알코올|청하|참이슬|처음처럼|카스|테라",
    r"치약|칫솔|가글|샴푸|린스|바디워시|비누|세제|섬유유연제|화장지|물티슈|생리대|면도|휴지",
    r"건전지|충전기|케이블|이어폰|우산|장갑|양말|마스크|밴드|파스(?!타)|상비약|의약품",
    r"상품권|기프트카드|교통카드|유심|택배|봉투|종량제|복권",
    r"사료|모래|방향제|살충제|모기|컵라면용기만|얼음컵",
]

RULES = [
    ("meal", r"도\)|김\)|삼\)|빅삼\)|햄\)|도시락|덮밥|비빔밥|볶음밥|김밥|삼각김밥|주먹밥|유부초밥|샐\)|샌\)|샌드위치|샌드|햄버거|버거|핫도그|몬테크리스토|브리또|또띠아|정찬|정식|한상|혜자|박스|스시|초밥|덮밥|가득"),
    ("noodle", r"라면|컵라면|누들|우동|국수|쌀국수|칼국수|짜장|짬뽕|파스타|스파게티|마라샹궈|면볶이|볶음면|비빔면"),
    ("protein", r"닭가슴살|프로틴|단백질|계란|달걀|반숙란|구운란|훈제란|두부|소시지|소세지|핫바|어묵|맛살|참치|연어|육포"),
    ("salad", r"샐러드|과일|사과|바나나|귤|포도|토마토|고구마|요거트|요구르트|그릭|플레인"),
    ("drink", r"생수|삼다수|백산수|아이시스|평창수|물|탄산|콜라|사이다|제로|음료|주스|쥬스|우유|두유|커피|아메리카노|라떼|에이드|차|티|tea|캔커피"),
    ("dessert", r"빵|베이커리|케이크|케익|카스테라|푸딩|마카롱|도넛|도너츠|와플|쿠키|비스킷|초코|초콜릿|아이스크림|아이스|젤라또|디저트|크림"),
    ("snack", r"과자|스낵|칩|젤리|캔디|사탕|껌|카라멜|팝콘|프레첼|나쵸|떡볶이|만두|튀김|오징어|먹태"),
    ("side", r"즉석밥|햇반|죽|스프|국|탕|찌개|카레|짜장|반찬|김치|장조림|감자|치킨|닭강정|떡갈비|닭갈비"),
]

DB_CATEGORY = {
    "meal": "MAIN_MEAL",
    "noodle": "RAMEN",
    "side": "SIDE",
    "protein": "SIDE",
    "salad": "SIDE",
    "drink": "DRINK",
    "snack": "SNACK",
    "dessert": "DESSERT",
}


def is_excluded(name: str) -> bool:
    return any(re.search(pattern, name, re.I) for pattern in EXCLUDE_RULES)


def classify_by_rule(name: str) -> str | None:
    if is_excluded(name):
        return None
    return next((category for category, pattern in RULES if re.search(pattern, name, re.I)), None)


def is_food_product(name: str) -> bool:
    return classify_by_rule(name) is not None


def classify(name: str, price: int, gemini: Callable[[str], str] | None = None) -> str:
    ruled = classify_by_rule(name)
    if ruled:
        return ruled
    if is_excluded(name):
        return ""
    if gemini is None:
        return ""
    result = gemini(json.dumps({"name": name, "price": price}, ensure_ascii=False)).strip().lower()
    return result if result in CATEGORIES else ""


def to_db_category(category: str) -> str:
    return DB_CATEGORY.get(category, "ETC")


@dataclass(frozen=True)
class CatalogProduct:
    store_code: str
    original_name: str
    price: int
    source_product_id: str | None = None
    brand_name: str | None = None
    capacity: str | None = None
    category: str = ""
    image_url: str | None = None
    source_url: str | None = None

    def __post_init__(self) -> None:
        if self.store_code not in {"CU", "GS25", "EMART24"}:
            raise ValueError("unsupported store")
        if not self.original_name or self.price <= 0:
            raise ValueError("name and positive price are required")
        if not self.category:
            raise ValueError("food category is required")

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






