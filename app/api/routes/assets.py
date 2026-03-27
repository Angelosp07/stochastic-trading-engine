from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

from app.storage.db import db

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetOut(BaseModel):
    id: int
    symbol: str
    name: str


@router.get("/", response_model=List[AssetOut])
def list_assets():
    rows = db.conn.execute("SELECT id, symbol, name FROM assets ORDER BY id").fetchall()
    return [AssetOut(id=row[0], symbol=row[1], name=row[2]) for row in rows]
