from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List

from app.storage.price_repository import PriceRepository

router = APIRouter(prefix="/prices", tags=["prices"])

price_repo = PriceRepository()

# ------------------------------
# Schema
# ------------------------------
class PriceOut(BaseModel):
    price: float
    timestamp: str

# ------------------------------
# Get last N prices
# ------------------------------
@router.get("/last/{asset_id}", response_model=List[PriceOut])
def get_last_prices(asset_id: int, n: int = Query(100, gt=0)):
    rows = price_repo.get_last_n(asset_id, n)

    if not rows:
        raise HTTPException(status_code=404, detail="No price data found")

    return [
        PriceOut(price=r[0], timestamp=r[1])
        for r in rows
    ]

# ------------------------------
# Get all price history
# ------------------------------
@router.get("/all/{asset_id}", response_model=List[PriceOut])
def get_all_prices(asset_id: int):
    rows = price_repo.get_all(asset_id)

    if not rows:
        raise HTTPException(status_code=404, detail="No price data found")

    return [
        PriceOut(price=r[0], timestamp=r[1])
        for r in rows
    ]