from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.storage.redis_client import add_order, get_order_from_redis, remove_order_from_redis
from app.storage.user_repository import UserRepository
from app.storage.position_repository import PositionRepository

router = APIRouter()

user_repo = UserRepository()
position_repo = PositionRepository()


class Order(BaseModel):
    side: str      # "bid" or "ask"
    price: float
    quantity: float
    user_id: int


@router.post("/order")
def create_order(order: Order):
    # Validate user
    user = user_repo.get_user(order.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id, username, balance = user

    # Check and reserve funds/assets
    if order.side == "bid":
        cost = order.price * order.quantity
        if balance < cost:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        user_repo.update_balance(order.user_id, balance - cost)

    elif order.side == "ask":
        position = position_repo.get_position(order.user_id)
        if position < order.quantity:
            raise HTTPException(status_code=400, detail="Not enough asset to sell")
        position_repo.update_position(order.user_id, position - order.quantity)

    else:
        raise HTTPException(status_code=400, detail="Invalid side, must be 'bid' or 'ask'")

    # Add order to Redis

    order_id = add_order(order.side, order.price, order.quantity, order.user_id)
    return {"status": "order added and funds/assets reserved", "order_id": order_id}


@router.post("/order/cancel/{order_id}")
def cancel_order(order_id: int):
    # Get order from Redis
    order = get_order_from_redis(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    user_id = order["user_id"]

    # Restore reserved funds/assets
    if order["side"] == "bid":
        user = user_repo.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        _, _, balance = user
        user_repo.update_balance(user_id, balance + order["price"] * order["quantity"])

    elif order["side"] == "ask":
        position = position_repo.get_position(user_id)
        position_repo.update_position(user_id, position + order["quantity"])

    # Remove order from Redis
    remove_order_from_redis(order_id)

    return {"status": "order cancelled and funds/assets released"}