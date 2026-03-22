import asyncio
from fastapi import APIRouter, WebSocket

router = APIRouter()

@router.websocket("/ws/price")
async def price_stream(ws: WebSocket):
    await ws.accept()
    engine = ws.app.state.engine

    while True:
        await ws.send_json({"price": engine.price})
        await asyncio.sleep(0.1)