from __future__ import annotations

import hashlib
import html
import re
from datetime import datetime, timezone
from urllib.parse import urljoin

HANGUL_RANGE = "\uac00-\ud7a3"
ONE_PLUS_ONE = "\uc6d0\ud50c\ub7ec\uc2a4\uc6d0"
TWO_PLUS_ONE = "\ud22c\ud50c\ub7ec\uc2a4\uc6d0"
THREE_PLUS_ONE = "\uc4f0\ub9ac\ud50c\ub7ec\uc2a4\uc6d0"
GIFT = "\ub364\uc99d\uc815"
SALE = "\ud560\uc778"
KOREAN_SALE = "\uc138\uc77c"
NEW_PRODUCT = "\uc2e0\uc0c1\ud488"


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
    value = re.sub(r"1\s*\+\s*1|2\s*\+\s*1", " ", value, flags=re.I)
    value = re.sub(r"[\(\)\[\]{}]", " ", value)
    # Capacity is stored independently and deliberately remains part of identity.
    # Only its spelling is removed from the comparable product name.
    value = re.sub(r"\d+(?:\.\d+)?\s*(?:ml|mL|ML|g|G|l|L|kg|KG|\uac1c\uc785|\uc785)", " ", value)
    value = re.sub(rf"[^{HANGUL_RANGE}a-zA-Z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip().lower()


def extract_capacity(value: str) -> str | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*(ml|g|kg|l|\uac1c\uc785|\uc785)\b", value, re.I)
    if not match:
        return None
    number, unit = match.groups()
    unit = unit.lower()
    if unit == "l":
        return f"{float(number) * 1000:g}ml"
    if unit == "kg":
        return f"{float(number) * 1000:g}g"
    return f"{number}{unit}"


def stable_key(*parts: str) -> str:
    raw = "|".join(parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def infer_promotion(raw: str) -> tuple[str, int, int]:
    text = re.sub(r"\s+", "", raw)
    if re.search(rf"1\+1|{ONE_PLUS_ONE}", text, re.I):
        return "1+1", 1, 2
    if re.search(rf"2\+1|{TWO_PLUS_ONE}", text, re.I):
        return "2+1", 2, 3
    if re.search(rf"3\+1|{THREE_PLUS_ONE}", text, re.I):
        return "3+1", 3, 4
    if re.search(rf"{GIFT}|GIFT", text, re.I):
        return "gift", 1, 1
    if re.search(rf"{SALE}|SALE|{KOREAN_SALE}", text, re.I):
        return "sale", 1, 1
    if re.search(rf"NEW|{NEW_PRODUCT}", text, re.I):
        return "new", 1, 1
    return "none", 1, 1


def infer_category_tags(name: str, promotion_type: str) -> tuple[str, list[str]]:
    lower = name.lower()
    tags = {"value"}
    category = "snack"

    if re.search(r"\uae40\ubc25|\uc0bc\uac01|\ub3c4\uc2dc\ub77d|\uc0cc\ub4dc|\ubc84\uac70|\ub77c\uba74|\ucef5|\uc6b0\ub3d9|\uad6d\uc218|\ube44\ube54|\ubc25", name):
        category = "meal"
        tags.update(["meal", "night"])
    if re.search(r"\ub2ed\uac00\uc2b4|\ud504\ub85c\ud2f4|\ub2e8\ubc31|\uacc4\ub780|\ubc18\uc219|\ub780|\ub450\ubd80|\uadf8\ub9ad|\uc694\uac70\ud2b8", name, re.I):
        category = "protein"
        tags.update(["protein", "diet"])
    if re.search(r"\uc81c\ub85c|\ub77c\uc774\ud2b8|\uc0d0\ub7ec\ub4dc|\ubc14\ub098\ub098|\ud50c\ub808\uc778|\uc800\ub2f9", name, re.I):
        tags.add("diet")
    if re.search(r"\ucf5c\ub77c|\uc0ac\uc774\ub2e4|\uc0dd\uc218|\uc6b0\uc720|\ucee4\ud53c|\uc74c\ub8cc|\uc8fc\uc2a4|\ubb3c|\ucc28|tea|\uce94", lower, re.I):
        if category != "protein":
            category = "drink"
        tags.add("snack")
    if re.search(r"\ucd08\ucf5c\ub9bf|\ucd08\ucf54|\ucfe0\ud0a4|\uc824\ub9ac|\uba58\ud1a0\uc2a4|\uce94\ub514|\uc544\uc774\uc2a4|\ud06c\ub9bc|\ucf00\uc774\ud06c|\ube75", name, re.I):
        category = "dessert"
        tags.add("snack")
    if re.search(r"\uc624\uc9d5\uc5b4|\uc721\ud3ec|\uba39\ud0dc|\uce69|\uacfc\uc790|\ub2ed\uac15\uc815|\ub5a1\ubcf6\uc774|\ub9cc\ub450", name, re.I):
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
