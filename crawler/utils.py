from __future__ import annotations

import hashlib
import html
import re
from datetime import datetime, timezone
from urllib.parse import urljoin


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def parse_price(value: str | None) -> int:
    if not value:
        return 0
    digits = re.sub(r"[^0-9]", "", value)
    return int(digits) if digits else 0


def normalize_name(value: str) -> str:
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\[[^\]]*\]", " ", value)
    value = re.sub(r"\d+(\.\d+)?\s?(g|ml|l|kg|개입|입)", " ", value, flags=re.I)
    value = re.sub(r"[^가-힣a-zA-Z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip().lower()


def stable_key(*parts: str) -> str:
    raw = "|".join(parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def infer_promotion(raw: str) -> tuple[str, int, int]:
    text = re.sub(r"\s+", "", raw)
    if re.search(r"1\+1|원플러스원", text, re.I):
        return "1+1", 1, 2
    if re.search(r"2\+1|투플러스원", text, re.I):
        return "2+1", 2, 3
    if re.search(r"3\+1|쓰리플러스원", text, re.I):
        return "3+1", 3, 4
    if re.search(r"덤증정|GIFT", text, re.I):
        return "gift", 1, 1
    if re.search(r"할인|SALE|세일", text, re.I):
        return "sale", 1, 1
    if re.search(r"NEW|신상품", text, re.I):
        return "new", 1, 1
    return "none", 1, 1


def infer_category_tags(name: str, promotion_type: str) -> tuple[str, list[str]]:
    lower = name.lower()
    tags = {"value"}
    category = "snack"

    if re.search(r"김밥|삼각|도시락|샌드|버거|라면|컵|우동|국수|비빔|밥", name):
        category = "meal"
        tags.update(["meal", "night"])
    if re.search(r"닭가슴|프로틴|단백|계란|반숙|란|두부|그릭|요거트", name, re.I):
        category = "protein"
        tags.update(["protein", "diet"])
    if re.search(r"제로|라이트|샐러드|바나나|플레인|저당", name, re.I):
        tags.add("diet")
    if re.search(r"콜라|사이다|생수|우유|커피|음료|주스|물|차|tea|캔", lower, re.I):
        if category != "protein":
            category = "drink"
        tags.add("snack")
    if re.search(r"초콜릿|초코|쿠키|젤리|멘토스|캔디|아이스|크림|케이크|빵", name, re.I):
        category = "dessert"
        tags.add("snack")
    if re.search(r"오징어|육포|먹태|칩|과자|닭강정|떡볶이|만두", name, re.I):
        category = "snack"
        tags.update(["night", "snack"])
    if promotion_type != "none":
        tags.add("value")

    return category, sorted(tags)


def month_range() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    end = next_month.timestamp() - 86400
    end_dt = datetime.fromtimestamp(end, tz=timezone.utc)
    return start.date().isoformat(), end_dt.date().isoformat()


def absolute_url(base: str, path: str | None) -> str | None:
    if not path:
        return None
    return urljoin(base, path)
