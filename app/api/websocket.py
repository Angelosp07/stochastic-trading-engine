import asyncio
from typing import Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

router = APIRouter()

class PriceOut(BaseModel):
    symbol: str
    price: float

# Helper to get current price from engine
def _sample_price(symbol: str, engine: object) -> PriceOut:
    return PriceOut(symbol=symbol, price=float(engine.price))

@router.websocket("/ws/price")
async def price_stream(
    websocket: WebSocket,
    symbol: Optional[str] = Query(None, description="Commodity symbol. Streams all if omitted."),
    interval: float = Query(0.5, gt=0, description="Push interval in seconds")
):
    await websocket.accept()

    engines: Dict[str, object] = getattr(websocket.app.state, "engines", {}) or {}
    if not engines:
        single = getattr(websocket.app.state, "engine", None)
        if single is None:
            await websocket.send_json({"error": "engines not initialized"})
            await websocket.close()
            return
        engines = {"DEFAULT": single}

    try:
        if symbol:
            # Single-symbol mode
            eng = engines.get(symbol)
            if eng is None:
                await websocket.send_json({"error": f"unknown symbol '{symbol}'"})
                await websocket.close()
                return

            while True:
                po = _sample_price(symbol, eng)
                await websocket.send_json(po.model_dump())
                await asyncio.sleep(interval)

        else:
            # Multi-symbol mode
            while True:
                payload = {sym: float(eng.price) for sym, eng in engines.items()}
                await websocket.send_json(payload)
                await asyncio.sleep(interval)

    except WebSocketDisconnect:
        return