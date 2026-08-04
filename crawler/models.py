from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Literal

RetailerCode = Literal["cu", "gs25", "seven", "emart24"]
PromotionType = Literal["none", "1+1", "2+1", "3+1", "sale", "new", "gift"]


@dataclass
class Product:
    retailerCode: RetailerCode
    externalKey: str
    brand: str
    name: str
    normalizedName: str
    price: int
    category: str
    tags: list[str]
    imageUrl: str | None
    promotionType: PromotionType
    purchaseQuantity: int
    rewardQuantity: int
    discountPrice: int | None
    startDate: str
    endDate: str
    collectedAt: str
    isNew: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
