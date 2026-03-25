from fastapi import APIRouter
from pydantic import BaseModel

from app.storage.position_repository import PositionRepository

router = APIRouter(prefix="/positions", tags=["positions"])

position_repo = PositionRepository()

# ------------------------------
# Schema
# ------------------------------
class PositionOut(BaseModel):
    user_id: int
    asset_id: int
    quantity: float

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