from datetime import datetime, timedelta, timezone
from random import Random

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


class GeneratePricesIn(BaseModel):
    n: int = 20000
    interval_seconds: int = 1
    start_price: float = 100.0
    drift: float = 0.0
    sigma: float = 0.015
    mean_reversion: float = 0.015
    long_run_price: float = 100.0
    jump_probability: float = 0.002
    jump_scale: float = 0.03
    seed: int = 42
    clear_existing: bool = False


class GeneratePricesOut(BaseModel):
    asset_id: int
    generated: int
    interval_seconds: int
    first_timestamp: str
    last_timestamp: str
    min_price: float
    max_price: float

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


@router.post("/generate/{asset_id}", response_model=GeneratePricesOut)
def generate_prices(asset_id: int, payload: GeneratePricesIn):
    if not price_repo.asset_exists(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

    if payload.n <= 0:
        raise HTTPException(status_code=400, detail="n must be > 0")
    if payload.interval_seconds <= 0:
        raise HTTPException(status_code=400, detail="interval_seconds must be > 0")
    if payload.start_price <= 0:
        raise HTTPException(status_code=400, detail="start_price must be > 0")

    rng = Random(payload.seed)
    if payload.clear_existing:
        price_repo.clear_asset_history(asset_id)

    dt = payload.interval_seconds / 60.0
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(seconds=(payload.n - 1) * payload.interval_seconds)

    price = payload.start_price
    min_price = price
    max_price = price
    rows = []

    for idx in range(payload.n):
        local_sigma = payload.sigma * (0.6 + 0.8 * abs(rng.gauss(0.0, 1.0)))
        diffusion = local_sigma * (dt ** 0.5) * rng.gauss(0.0, 1.0)
        drift_term = payload.drift * dt
        reversion = payload.mean_reversion * (payload.long_run_price - price) * dt

        jump = 0.0
        if rng.random() < payload.jump_probability:
            direction = 1 if rng.random() > 0.5 else -1
            jump = direction * payload.jump_scale * price * (0.5 + rng.random())

        next_price = price * (1.0 + drift_term + diffusion) + reversion + jump
        price = max(0.01, next_price)

        min_price = min(min_price, price)
        max_price = max(max_price, price)
        ts = (start_time + timedelta(seconds=idx * payload.interval_seconds)).isoformat()
        rows.append((asset_id, round(price, 6), ts))

    price_repo.insert_many_with_timestamps(rows)

    return GeneratePricesOut(
        asset_id=asset_id,
        generated=payload.n,
        interval_seconds=payload.interval_seconds,
        first_timestamp=rows[0][2],
        last_timestamp=rows[-1][2],
        min_price=round(min_price, 6),
        max_price=round(max_price, 6),
    )
