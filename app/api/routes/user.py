from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.storage.user_repository import UserRepository

router = APIRouter()
user_repo = UserRepository()

class UserCreate(BaseModel):
    username: str
    balance: float

@router.post("/users")
def create_user(user: UserCreate):
    try:
        user_id = user_repo.create_user(user.username, user.balance)
        return {"user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))