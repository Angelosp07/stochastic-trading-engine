from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List

from app.storage.order_repository import OrderRepository
from app.storage.position_repository import PositionRepository
from app.storage.price_repository import PriceRepository
from app.storage.user_repository import UserRepository
from app.storage.db import db

router = APIRouter(prefix="/orders", tags=["orders"])

order_repo = OrderRepository()
user_repo = UserRepository()
position_repo = PositionRepository()
price_repo = PriceRepository()

FEE_RATE = 0.001
SLIPPAGE_BPS = 5
MAX_POSITION_UNITS = 10000.0
MAX_DAILY_LOSS = 250000.0

# ------------------------------
# Schemas
# ------------------------------
class OrderCreate(BaseModel):
    user_id: int
    asset_id: int
    side: str   # 'bid' or 'ask'
    price: float = 0.0
    quantity: float
    order_type: str = "market"
    limit_price: float | None = None
    stop_price: float | None = None
    take_profit_price: float | None = None

class OrderOut(BaseModel):
    id: int
    user_id: int
    asset_id: int
    side: str
    price: float
    quantity: float
    status: str
    timestamp: str


class OrderUpdateIn(BaseModel):
    quantity: float | None = None
    limit_price: float | None = None


class ReduceOrderIn(BaseModel):
    reduce_by: float


class MarketTradeIn(BaseModel):
    user_id: int
    asset_id: int
    side: str
    quantity: float
    order_type: str = "market"
    requested_price: float | None = None


class MarketTradeOut(BaseModel):
    order_id: int
    user_id: int
    asset_id: int
    symbol: str
    side: str
    quantity: float
    requested_price: float | None = None
    execution_price: float
    slippage: float = 0.0
    fee: float = 0.0
    total: float
    new_balance: float


class ClosePositionIn(BaseModel):
    user_id: int
    asset_id: int
    quantity: float | None = None


class CloseAllPositionsIn(BaseModel):
    user_id: int


class CloseAllPositionsOut(BaseModel):
    user_id: int
    closed_positions: int
    total_quantity: float
    total_value: float
    total_fees: float = 0.0
    new_balance: float


class FillOut(BaseModel):
    id: int
    user_id: int
    asset_id: int
    symbol: str
    name: str
    side: str
    quantity: float
    requested_price: float | None = None
    execution_price: float
    fee: float
    slippage: float
    order_type: str
    status: str
    notes: str | None = None
    timestamp: str


class ActivityOut(BaseModel):
    user_id: int
    today_fills: int
    today_fees: float
    today_notional: float
    open_orders: int


def _normalize_side(side: str) -> str:
    value = side.strip().lower()
    if value in {"buy", "bid"}:
        return "buy"
    if value in {"sell", "ask"}:
        return "sell"
    raise HTTPException(status_code=400, detail="side must be buy/sell")


def _get_asset(asset_id: int):
    row = db.conn.execute(
        "SELECT id, symbol, name FROM assets WHERE id = ? LIMIT 1",
        (asset_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    return row


def _latest_or_engine_price(asset_id: int, symbol: str, request: Request) -> float:
    latest = price_repo.get_latest_point(asset_id)
    if latest:
        return float(latest[0])
    engine_map = getattr(request.app.state, "engines", {}) or {}
    engine = engine_map.get(symbol)
    if engine is None:
        raise HTTPException(status_code=400, detail="No market price available for asset")
    return float(engine.price)


def _execution_price(base_price: float, side: str, requested_price: float | None) -> tuple[float, float]:
    slip = base_price * (SLIPPAGE_BPS / 10_000.0)
    execution = base_price + slip if side == "buy" else max(0.01, base_price - slip)

    if requested_price is not None and requested_price > 0:
        if side == "buy":
            execution = max(execution, float(requested_price))
        else:
            execution = min(execution, float(requested_price))

    return execution, execution - base_price


def _check_risk_limits(user_id: int, asset_id: int, side: str, quantity: float):
    if side != "buy":
        return

    state = position_repo.get_position_row(user_id, asset_id)
    if state["quantity"] + quantity > MAX_POSITION_UNITS:
        raise HTTPException(status_code=400, detail="Max position size exceeded")

    rows = position_repo.get_positions_for_user_detailed(user_id)
    total_realized = sum(float(row[7] or 0.0) for row in rows)
    if total_realized < -MAX_DAILY_LOSS:
        raise HTTPException(status_code=400, detail="Max daily loss reached")

# ------------------------------
# Create order
# ------------------------------
@router.post("/", response_model=int)
def create_order(order: OrderCreate):
    side = _normalize_side(order.side)
    if order.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")
    order_type = order.order_type.strip().lower()
    if order_type not in {"market", "limit", "stop", "take_profit"}:
        raise HTTPException(status_code=400, detail="Unsupported order_type")

    order_id = order_repo.create_order(
        user_id=order.user_id,
        asset_id=order.asset_id,
        side="bid" if side == "buy" else "ask",
        price=order.price,
        quantity=order.quantity,
        order_type=order_type,
        stop_price=order.stop_price,
        take_profit_price=order.take_profit_price,
        limit_price=order.limit_price,
    )
    return order_id

# ------------------------------
# Get order by ID
# ------------------------------
@router.get("/{order_id:int}", response_model=OrderOut)
def get_order(order_id: int):
    row = order_repo.get_order(order_id)
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderOut(
        id=row[0],
        user_id=row[1],
        asset_id=row[2],
        side=row[3],
        price=row[4],
        quantity=row[5],
        status=row[6],
        timestamp=row[7]
    )

# ------------------------------
# Get open orders by side 'bid' or 'ask'
# ------------------------------
@router.get("/side/{side}", response_model=List[OrderOut])
def get_orders_by_side(side: str):
    normalized = _normalize_side(side)
    rows = order_repo.get_orders_by_side("bid" if normalized == "buy" else "ask")

    return [
        OrderOut(
            id=r[0],
            user_id=r[1],
            asset_id=r[2],
            side=normalized,
            price=r[3],
            quantity=r[4],
            status=r[5],
            timestamp=r[6]
        )
        for r in rows
    ]


@router.get("/user/{user_id}")
def get_user_orders(user_id: int, limit: int = 200):
    if not user_repo.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    rows = order_repo.get_orders_for_user(user_id=user_id, limit=max(1, min(limit, 2000)))
    return [
        {
            "id": row[0],
            "user_id": row[1],
            "asset_id": row[2],
            "symbol": row[3],
            "name": row[4],
            "side": "buy" if row[5] == "bid" else "sell",
            "price": row[6],
            "quantity": row[7],
            "status": row[8],
            "timestamp": row[9],
            "order_type": row[10],
        }
        for row in rows
    ]


@router.get("/fills/{user_id}", response_model=List[FillOut])
def get_user_fills(user_id: int, limit: int = 500):
    if not user_repo.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    rows = order_repo.get_fills_for_user(user_id=user_id, limit=max(1, min(limit, 5000)))
    return [
        FillOut(
            id=row[0],
            user_id=row[1],
            asset_id=row[2],
            symbol=row[3],
            name=row[4],
            side=row[5],
            quantity=row[6],
            requested_price=row[7],
            execution_price=row[8],
            fee=row[9],
            slippage=row[10],
            order_type=row[11],
            status=row[12],
            notes=row[13],
            timestamp=row[14],
        )
        for row in rows
    ]


@router.get("/account-activity/{user_id}", response_model=ActivityOut)
def get_account_activity(user_id: int):
    if not user_repo.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")

    today = datetime.now(timezone.utc).date().isoformat()
    metrics = db.conn.execute(
        """
        SELECT COUNT(*), COALESCE(SUM(fee), 0), COALESCE(SUM(quantity * execution_price), 0)
        FROM fills
        WHERE user_id = ? AND DATE(timestamp) = ?
        """,
        (user_id, today),
    ).fetchone()
    open_orders = db.conn.execute(
        "SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'open'",
        (user_id,),
    ).fetchone()[0]

    return ActivityOut(
        user_id=user_id,
        today_fills=int(metrics[0] or 0),
        today_fees=float(metrics[1] or 0),
        today_notional=float(metrics[2] or 0),
        open_orders=int(open_orders or 0),
    )


@router.patch("/{order_id:int}")
def update_open_order(order_id: int, payload: OrderUpdateIn):
    row = order_repo.update_open_order(order_id, payload.quantity, payload.limit_price)
    if not row:
        raise HTTPException(status_code=400, detail="Order cannot be updated")
    return {
        "id": row[0],
        "user_id": row[1],
        "asset_id": row[2],
        "side": "buy" if row[3] == "bid" else "sell",
        "price": row[4],
        "quantity": row[5],
        "status": row[6],
        "timestamp": row[7],
        "order_type": row[8],
        "limit_price": row[11],
    }


@router.post("/{order_id:int}/reduce")
def reduce_order(order_id: int, payload: ReduceOrderIn):
    if payload.reduce_by <= 0:
        raise HTTPException(status_code=400, detail="reduce_by must be > 0")
    order = order_repo.get_order(order_id)
    if not order or order[6] != "open":
        raise HTTPException(status_code=400, detail="Order cannot be reduced")

    next_qty = float(order[5]) - float(payload.reduce_by)
    if next_qty <= 0:
        success = order_repo.cancel_order(order_id, user_repo)
        if not success:
            raise HTTPException(status_code=400, detail="Order cannot be reduced")
        return {"status": "cancelled", "order_id": order_id}

    updated = order_repo.update_open_order(order_id, quantity=next_qty)
    if not updated:
        raise HTTPException(status_code=400, detail="Order cannot be reduced")
    return {"status": "updated", "order_id": order_id, "quantity": next_qty}


@router.get("/close-preview/{user_id}/{asset_id}")
def close_preview(user_id: int, asset_id: int, portion: float = 1.0):
    if not user_repo.get_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    asset = _get_asset(asset_id)
    held = position_repo.get_position_row(user_id, asset_id)["quantity"]
    if held <= 0:
        raise HTTPException(status_code=400, detail="No position for this asset")
    safe_portion = min(1.0, max(0.01, float(portion)))
    qty = held * safe_portion
    latest = price_repo.get_latest_point(asset_id)
    if not latest:
        raise HTTPException(status_code=400, detail="No market price available for asset")
    reference_price = float(latest[0])
    est_exec = max(0.01, reference_price - reference_price * (SLIPPAGE_BPS / 10_000.0))
    notional = est_exec * qty
    est_fee = notional * FEE_RATE
    return {
        "user_id": user_id,
        "asset_id": asset_id,
        "symbol": asset[1],
        "quantity_to_close": qty,
        "reference_price": reference_price,
        "estimated_fees": est_fee,
        "estimated_proceeds": notional - est_fee,
    }

# ------------------------------
# Cancel order
# ------------------------------
@router.post("/{order_id:int}/cancel")
def cancel_order(order_id: int):
    success = order_repo.cancel_order(order_id, user_repo)

    if not success:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")

    return {"status": "cancelled", "order_id": order_id}


@router.post("/market", response_model=MarketTradeOut)
def execute_market_trade(payload: MarketTradeIn, request: Request):
    normalized_side = _normalize_side(payload.side)

    quantity = float(payload.quantity)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    user_row = user_repo.get_user(payload.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    asset_row = _get_asset(payload.asset_id)
    symbol = asset_row[1]

    _check_risk_limits(payload.user_id, payload.asset_id, normalized_side, quantity)
    base_price = _latest_or_engine_price(payload.asset_id, symbol, request)
    execution_price, slippage = _execution_price(base_price, normalized_side, payload.requested_price)
    total = execution_price * quantity
    fee = total * FEE_RATE
    balance = float(user_row[2])

    if normalized_side == "buy":
        if balance < total + fee:
            raise HTTPException(status_code=400, detail="Insufficient liquidity")
        user_repo.update_balance(payload.user_id, -(total + fee))
        position_repo.apply_fill(payload.user_id, payload.asset_id, "buy", quantity, execution_price, fee)
        order_side = "bid"
    else:
        held_quantity = float(position_repo.get_position_row(payload.user_id, payload.asset_id)["quantity"])
        if held_quantity < quantity:
            raise HTTPException(status_code=400, detail="Insufficient shares")
        user_repo.update_balance(payload.user_id, total - fee)
        position_repo.apply_fill(payload.user_id, payload.asset_id, "sell", quantity, execution_price, fee)
        order_side = "ask"

    order_id = order_repo.create_filled_order(
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        side=order_side,
        price=execution_price,
        quantity=quantity,
        order_type=payload.order_type,
    )

    order_repo.record_fill(
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        side=normalized_side,
        quantity=quantity,
        requested_price=payload.requested_price,
        execution_price=execution_price,
        fee=fee,
        slippage=slippage,
        order_type=payload.order_type,
        status="filled",
    )

    updated_user = user_repo.get_user(payload.user_id)

    return MarketTradeOut(
        order_id=order_id,
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        symbol=symbol,
        side=normalized_side,
        quantity=quantity,
        requested_price=payload.requested_price,
        execution_price=execution_price,
        slippage=slippage,
        fee=fee,
        total=total,
        new_balance=float(updated_user[2])
    )


@router.post("/close-position", response_model=MarketTradeOut)
def close_position(payload: ClosePositionIn, request: Request):
    user_row = user_repo.get_user(payload.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    asset_row = db.conn.execute(
        "SELECT id, symbol FROM assets WHERE id = ? LIMIT 1",
        (payload.asset_id,)
    ).fetchone()
    if not asset_row:
        raise HTTPException(status_code=404, detail="Asset not found")
    symbol = asset_row[1]

    held_quantity = float(position_repo.get_position_row(payload.user_id, payload.asset_id)["quantity"])
    if held_quantity <= 0:
        raise HTTPException(status_code=400, detail="No open position for this asset")

    epsilon = 1e-9
    quantity_to_close = held_quantity if payload.quantity is None else float(payload.quantity)
    if quantity_to_close <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")
    if quantity_to_close - held_quantity > epsilon:
        raise HTTPException(status_code=400, detail="Quantity exceeds held position")
    quantity_to_close = min(quantity_to_close, held_quantity)

    base_price = _latest_or_engine_price(payload.asset_id, symbol, request)
    execution_price, slippage = _execution_price(base_price, "sell", None)
    total = execution_price * quantity_to_close
    fee = total * FEE_RATE
    user_repo.update_balance(payload.user_id, total - fee)
    position_repo.apply_fill(payload.user_id, payload.asset_id, "sell", quantity_to_close, execution_price, fee)

    order_id = order_repo.create_filled_order(
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        side="ask",
        price=execution_price,
        quantity=quantity_to_close,
        order_type="market",
    )

    order_repo.record_fill(
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        side="sell",
        quantity=quantity_to_close,
        requested_price=None,
        execution_price=execution_price,
        fee=fee,
        slippage=slippage,
        order_type="market",
        status="filled",
        notes="close-position",
    )

    updated_user = user_repo.get_user(payload.user_id)

    return MarketTradeOut(
        order_id=order_id,
        user_id=payload.user_id,
        asset_id=payload.asset_id,
        symbol=symbol,
        side="sell",
        quantity=quantity_to_close,
        requested_price=None,
        execution_price=execution_price,
        slippage=slippage,
        fee=fee,
        total=total,
        new_balance=float(updated_user[2])
    )


@router.post("/close-all-positions", response_model=CloseAllPositionsOut)
def close_all_positions(payload: CloseAllPositionsIn, request: Request):
    user_row = user_repo.get_user(payload.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    open_positions = position_repo.get_positions_for_user(payload.user_id)
    if not open_positions:
        raise HTTPException(status_code=400, detail="No open positions to close")

    engine_map = getattr(request.app.state, "engines", {}) or {}
    closed_positions = 0
    total_quantity = 0.0
    total_value = 0.0
    total_fees = 0.0

    for row in open_positions:
        asset_id = int(row[1])
        symbol = row[2]
        quantity = float(row[4])
        if quantity <= 0:
            continue

        latest = price_repo.get_latest_point(asset_id)
        if latest:
            base_price = float(latest[0])
        else:
            if symbol in engine_map:
                base_price = float(engine_map[symbol].price)
            else:
                continue

        execution_price, slippage = _execution_price(base_price, "sell", None)

        value = execution_price * quantity
        fee = value * FEE_RATE
        user_repo.update_balance(payload.user_id, value - fee)
        position_repo.apply_fill(payload.user_id, asset_id, "sell", quantity, execution_price, fee)
        order_repo.create_filled_order(
            user_id=payload.user_id,
            asset_id=asset_id,
            side="ask",
            price=execution_price,
            quantity=quantity,
            order_type="market",
        )
        order_repo.record_fill(
            user_id=payload.user_id,
            asset_id=asset_id,
            side="sell",
            quantity=quantity,
            requested_price=None,
            execution_price=execution_price,
            fee=fee,
            slippage=slippage,
            order_type="market",
            status="filled",
            notes="close-all-positions",
        )

        closed_positions += 1
        total_quantity += quantity
        total_value += value
        total_fees += fee

    if closed_positions == 0:
        raise HTTPException(status_code=400, detail="No closeable positions with market prices")

    updated_user = user_repo.get_user(payload.user_id)
    return CloseAllPositionsOut(
        user_id=payload.user_id,
        closed_positions=closed_positions,
        total_quantity=total_quantity,
        total_value=total_value,
        total_fees=total_fees,
        new_balance=float(updated_user[2])
    )