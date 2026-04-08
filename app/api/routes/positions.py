from fastapi import APIRouter
from pydantic import BaseModel

from app.storage.position_repository import PositionRepository
from app.storage.price_repository import PriceRepository
from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/positions", tags=["positions"])

position_repo = PositionRepository()
price_repo = PriceRepository()
user_repo = UserRepository()

# ------------------------------
# Schema
# ------------------------------
class PositionOut(BaseModel):
    user_id: int
    asset_id: int
    quantity: float


class UserPositionOut(BaseModel):
    user_id: int
    asset_id: int
    symbol: str
    name: str
    quantity: float


class UserPositionDetailedOut(BaseModel):
    user_id: int
    asset_id: int
    symbol: str
    name: str
    quantity: float
    avg_entry_price: float
    market_price: float
    market_value: float
    cost_basis: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    realized_pnl: float


class PortfolioSummaryOut(BaseModel):
    user_id: int
    cash_balance: float
    holdings_value: float
    total_equity: float
    total_cost_basis: float
    total_unrealized_pnl: float
    total_realized_pnl: float
    total_return_pct: float
    allocations: list[dict]

# ------------------------------
# Get position
# ------------------------------
@router.get("/", response_model=PositionOut)
def get_position(user_id: int, asset_id: int):
    quantity = position_repo.get_position(user_id, asset_id)

    return PositionOut(
        user_id=user_id,
        asset_id=asset_id,
        quantity=quantity
    )


@router.get("/user/{user_id}", response_model=list[UserPositionOut])
def get_user_positions(user_id: int):
    rows = position_repo.get_positions_for_user(user_id)
    return [
        UserPositionOut(
            user_id=row[0],
            asset_id=row[1],
            symbol=row[2],
            name=row[3],
            quantity=row[4],
        )
        for row in rows
    ]


@router.get("/user/{user_id}/detailed", response_model=list[UserPositionDetailedOut])
def get_user_positions_detailed(user_id: int):
    rows = position_repo.get_positions_for_user_detailed(user_id)
    asset_ids = [int(row[1]) for row in rows]
    latest = price_repo.get_latest_points_map(asset_ids)

    result = []
    for row in rows:
        market_price = float(latest.get(int(row[1]), {}).get("price", row[5] or 0.0))
        quantity = float(row[4] or 0.0)
        cost_basis = float(row[6] or 0.0)
        market_value = quantity * market_price
        unrealized = market_value - cost_basis
        unrealized_pct = (unrealized / cost_basis * 100) if cost_basis > 0 else 0.0
        result.append(
            UserPositionDetailedOut(
                user_id=int(row[0]),
                asset_id=int(row[1]),
                symbol=row[2],
                name=row[3],
                quantity=quantity,
                avg_entry_price=float(row[5] or 0.0),
                market_price=market_price,
                market_value=market_value,
                cost_basis=cost_basis,
                unrealized_pnl=unrealized,
                unrealized_pnl_pct=unrealized_pct,
                realized_pnl=float(row[7] or 0.0),
            )
        )
    return result


@router.get("/user/{user_id}/summary", response_model=PortfolioSummaryOut)
def get_user_portfolio_summary(user_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        return PortfolioSummaryOut(
            user_id=user_id,
            cash_balance=0.0,
            holdings_value=0.0,
            total_equity=0.0,
            total_cost_basis=0.0,
            total_unrealized_pnl=0.0,
            total_realized_pnl=0.0,
            total_return_pct=0.0,
            allocations=[],
        )

    detailed = get_user_positions_detailed(user_id)
    holdings_value = sum(p.market_value for p in detailed)
    cost_basis = sum(p.cost_basis for p in detailed)
    unrealized = sum(p.unrealized_pnl for p in detailed)
    realized = sum(p.realized_pnl for p in detailed)
    cash = float(user[2] or 0.0)
    total_equity = cash + holdings_value
    invested = cost_basis if cost_basis > 0 else 1.0
    total_return_pct = ((unrealized + realized) / invested) * 100 if cost_basis > 0 else 0.0

    allocations = []
    for p in detailed:
        weight = (p.market_value / holdings_value * 100) if holdings_value > 0 else 0.0
        allocations.append(
            {
                "symbol": p.symbol,
                "name": p.name,
                "value": p.market_value,
                "weight_pct": weight,
            }
        )

    return PortfolioSummaryOut(
        user_id=user_id,
        cash_balance=cash,
        holdings_value=holdings_value,
        total_equity=total_equity,
        total_cost_basis=cost_basis,
        total_unrealized_pnl=unrealized,
        total_realized_pnl=realized,
        total_return_pct=total_return_pct,
        allocations=allocations,
    )