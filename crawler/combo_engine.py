from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations


@dataclass(frozen=True)
class Offer:
    id: str
    store_code: str
    name: str
    category: str
    price: int
    promotion_type: str | None = None

    @property
    def payment_amount(self) -> int:
        return self.price * (2 if self.promotion_type == "TWO_PLUS_ONE" else 1)

    @property
    def received_quantity(self) -> int:
        return 2 if self.promotion_type == "ONE_PLUS_ONE" else 3 if self.promotion_type == "TWO_PLUS_ONE" else 1


REQUIRED = {
    "MEAL": {"MAIN_MEAL", "RAMEN", "RICE"},
    "NIGHT": {"RAMEN", "SNACK", "ALCOHOL_SIDE"},
    "SNACK": {"SNACK", "DESSERT"},
    "VALUE": set(),
}
SUPPORT = {"MEAL": {"DRINK", "SIDE"}, "NIGHT": {"DRINK"}, "SNACK": {"DRINK", "COFFEE"}, "VALUE": set()}


def category_balance_score(offers: tuple[Offer, ...], purpose: str) -> float:
    categories = {offer.category for offer in offers}
    required = bool(categories & REQUIRED[purpose]) if REQUIRED[purpose] else True
    support = bool(categories & SUPPORT[purpose]) if SUPPORT[purpose] else True
    return (50 if required else -100) + (20 if support else 0) + len(categories) * 5


def combinations_for(offers: list[Offer], budget: int, purpose: str) -> list[dict]:
    results = []
    for count in range(2, 5):
        for picked in combinations(offers, count):
            if len({item.store_code for item in picked}) != 1:
                continue
            payment = sum(item.payment_amount for item in picked)
            if payment > budget or (REQUIRED[purpose] and not any(item.category in REQUIRED[purpose] for item in picked)):
                continue
            promotion_count = sum(bool(item.promotion_type) for item in picked)
            score = payment / budget * 100 + category_balance_score(picked, purpose) + promotion_count * (18 if purpose == "VALUE" else 8)
            results.append({"store_code": picked[0].store_code, "items": picked, "payment_amount": payment,
                            "received_quantity": sum(item.received_quantity for item in picked), "leftover": budget-payment, "score": score})
    return sorted(results, key=lambda result: (-result["score"], result["leftover"]))
