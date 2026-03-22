from fastapi import APIRouter
from app.storage.price_repository import PriceRepository

router = APIRouter()
repo = PriceRepository()

@router.get("/history")
def get_history(n: int = 50):
    data = repo.get_last_n(n)
    return [{"price": p, "timestamp": t} for p, t in data]