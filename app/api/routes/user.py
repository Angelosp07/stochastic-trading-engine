from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/users", tags=["users"])

user_repo = UserRepository()

# ------------------------------
# Schemas
# ------------------------------
class UserCreate(BaseModel):
    username: str
    balance: float

class BalanceUpdate(BaseModel):
    delta_balance: float

class BalanceSet(BaseModel):
    balance: float

class UserOut(BaseModel):
    id: int
    username: str
    balance: float
    created_at: str

# ------------------------------
# Create user
# ------------------------------
@router.post("/", response_model=int)
def create_user(user: UserCreate):
    user_id = user_repo.create_user(
        username=user.username,
        balance=user.balance
    )
    return user_id

# ------------------------------
# Get user
# ------------------------------
@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int):
    row = user_repo.get_user(user_id)

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return UserOut(
        id=row[0],
        username=row[1],
        balance=row[2],
        created_at=row[3]
    )

# ------------------------------
# Update balance (increment/decrement)
# ------------------------------
@router.post("/{user_id}/balance/update")
def update_balance(user_id: int, payload: BalanceUpdate):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_repo.update_balance(user_id, payload.delta_balance)

    return {
        "user_id": user_id,
        "delta": payload.delta_balance,
        "status": "updated"
    }

# ------------------------------
# Set balance directly
# ------------------------------
@router.post("/{user_id}/balance/set")
def set_balance(user_id: int, payload: BalanceSet):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_repo.set_balance(user_id, payload.balance)

    return {
        "user_id": user_id,
        "balance": payload.balance,
        "status": "set"
    }