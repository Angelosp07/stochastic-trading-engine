from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.storage.order_repository import OrderRepository
from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/orders", tags=["orders"])

order_repo = OrderRepository()
user_repo = UserRepository()

# ------------------------------
# Schemas
# ------------------------------
class OrderCreate(BaseModel):
    user_id: int
    asset_id: int
    side: str   # 'bid' or 'ask'
    price: float
    quantity: float

class OrderOut(BaseModel):
    id: int
    user_id: int
    asset_id: int
    side: str
    price: float
    quantity: float
    status: str
    timestamp: str

# ------------------------------
# Create order
# ------------------------------
@router.post("/", response_model=int)
def create_order(order: OrderCreate):
    order_id = order_repo.create_order(
        user_id=order.user_id,
        asset_id=order.asset_id,
        side=order.side,
        price=order.price,
        quantity=order.quantity
    )
    return order_id

# ------------------------------
# Get order by ID
# ------------------------------
@router.get("/{order_id}", response_model=OrderOut)
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
    rows = order_repo.get_orders_by_side(side)

    return [
        OrderOut(
            id=r[0],
            user_id=r[1],
            asset_id=r[2],
            price=r[3],
            quantity=r[4],
            status=r[5],
            timestamp=r[6]
        )
        for r in rows
    ]

# ------------------------------
# Cancel order
# ------------------------------
@router.post("/{order_id}/cancel")
def cancel_order(order_id: int):
    success = order_repo.cancel_order(order_id, user_repo)

    if not success:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")

    return {"status": "cancelled", "order_id": order_id}