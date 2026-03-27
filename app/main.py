import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.storage.position_repository import PositionRepository
from app.engine.processes.brownian import BrownianMotion
from app.engine.processes.birth_death import BirthDeathProcess
from app.engine.processes.jump import JumpProcess
from app.engine.price_engine import PriceEngine
from app.engine.scheduler import Scheduler

from app.storage.db import *
from app.storage.order_repository import OrderRepository
from app.storage.user_repository import UserRepository
from app.storage.price_repository import PriceRepository
from app.config import *

from app.api.websocket import router
from app.api.routes.orders import router as orders_router
from app.api.routes.price import router as price_router
from app.api.routes.user import router as users_router
from app.api.routes.positions import router as positions_router
from app.api.routes.assets import router as assets_router

# ------------------------------
# Initialize FastAPI
# ------------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(orders_router)
app.include_router(price_router)
app.include_router(users_router)
app.include_router(positions_router)
app.include_router(assets_router)

# ------------------------------
# Initialize DB for demo
# ------------------------------
clear_tables(DB_PATH)
conn = db.conn
seed_assets(conn)
seed_users(conn)

user_repo = UserRepository()
order_repo = OrderRepository()
price_repo = PriceRepository()
position_repo = PositionRepository()

# ------------------------------
# Initialize stochastic engines (from DB assets)
# ------------------------------
config_map = seed_assets(conn)

rows = conn.execute("SELECT id, symbol FROM assets").fetchall()

engines = {}

for asset_id, symbol in rows:
    cfg = config_map[symbol]

    engines[symbol] = PriceEngine(
        initial_price=cfg["initial_price"],
        brownian=BrownianMotion(
            mu=cfg["mu"],
            sigma=cfg["sigma"]
        ),
        birth_death=BirthDeathProcess(
            lambda_birth=cfg["lambda_birth"],
            lambda_death=cfg["lambda_death"]
        ),
        jump=JumpProcess(
            jump_up=cfg["jump_up"],
            jump_down=cfg["jump_down"]
        )
    )

# Attach engines to app state so WebSocket can access them
app.state.engines = engines

# ------------------------------
# Scheduler tasks for all engines
# ------------------------------
async def run_all_schedulers():
    tasks = []
    for idx, (symbol, engine) in enumerate(engines.items(), start=1):
        scheduler = Scheduler(
            engine=engine,
            asset_id=idx,
            dt=0.1,
            order_repo=order_repo,
            user_repository=user_repo,
            position_repository=position_repo,
            price_repo=price_repo,
            debug=False
        )
        tasks.append(asyncio.create_task(scheduler.run()))
    await asyncio.gather(*tasks)

# ------------------------------
# Start background tasks on startup
# ------------------------------
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(run_all_schedulers())

# ------------------------------
# Run the app with uvicorn
# ------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


# import os
# # import asyncio
# from typing import Dict, List, Tuple
#
# from fastapi import FastAPI
#
# from app.api.routes import price, orders, history, user
# from app.api import websocket
#
# from app.engine.price_engine import PriceEngine
# from app.engine.processes.brownian import BrownianMotion
# from app.engine.processes.birth_death import BirthDeathProcess
# from app.engine.processes.jump import JumpProcess
# from app.engine.scheduler import Scheduler
#
# from app.storage.db import db  # sqlite connection
# from app.config import seed_assets
#
# seed_assets(db.conn)
# app = FastAPI(title="Stochastic Trading Engine")
#
# # Routers
# app.include_router(user.router)
# app.include_router(price.router)
# app.include_router(orders.router)
# app.include_router(history.router)
# app.include_router(websocket.router)
#
# # ---- Read env ----
# APP_ASSETS = os.getenv("APP_ASSETS", "CMD1:Commodity 1,CMD2:Commodity 2,CMD3:Commodity 3").strip()
#
# ENGINE_INITIAL_PRICE = float(os.getenv("APP_ENGINE_INITIAL_PRICE", "100.0"))
# ENGINE_DT = float(os.getenv("APP_ENGINE_DT", "0.05"))
# SCHEDULER_BATCH_SIZE = int(os.getenv("APP_SCHEDULER_BATCH_SIZE", "20"))
# IMPACT_COEFF = float(os.getenv("APP_IMPACT_COEFF", "0.001"))
#
# INITIAL_PRICE_MAP_SPEC = os.getenv("APP_ENGINE_INITIAL_PRICE_MAP", "")
# DT_MAP_SPEC = os.getenv("APP_ENGINE_DT_MAP", "")
# IMPACT_MAP_SPEC = os.getenv("APP_IMPACT_COEFF_MAP", "")
#
#
# def _parse_assets(spec: str) -> List[Tuple[str, str]]:
#     """Parses 'CMD1:Commodity 1,CMD2:Commodity 2' -> [('CMD1','Commodity 1'), ('CMD2','Commodity 2')]"""
#     pairs: List[Tuple[str, str]] = []
#     for part in [s for s in spec.split(",") if s.strip()]:
#         if ":" not in part:
#             raise ValueError(f"Invalid APP_ASSETS entry '{part}'. Expected 'SYMBOL:Name'.")
#         sym, name = part.split(":", 1)
#         sym, name = sym.strip(), name.strip()
#         if not sym or not name:
#             raise ValueError(f"Invalid APP_ASSETS entry '{part}'. Empty symbol or name.")
#         pairs.append((sym, name))
#     return pairs
#
#
# def _parse_map(spec: str) -> Dict[str, float]:
#     """
#     Parses maps like 'CMD1:100,CMD2:120' -> {'CMD1': 100.0, 'CMD2': 120.0}
#     Empty spec -> {}
#     """
#     result: Dict[str, float] = {}
#     for part in [s for s in spec.split(",") if s.strip()]:
#         if ":" not in part:
#             continue
#         k, v = part.split(":", 1)
#         k, v = k.strip(), v.strip()
#         if not k or not v:
#             continue
#         try:
#             result[k] = float(v)
#         except ValueError:
#             raise ValueError(f"Invalid numeric value in map entry '{part}'")
#     return result
#
#
# def _ensure_asset(symbol: str, name: str) -> int:
#     """Ensure asset exists and return its id (uses schema from db.py)."""
#     conn = db.conn
#     row = conn.execute("SELECT id FROM assets WHERE symbol = ?", (symbol,)).fetchone()
#     if row:
#         return row[0]
#     cur = conn.execute("INSERT INTO assets (symbol, name) VALUES (?, ?)", (symbol, name))
#     conn.commit()
#     return cur.lastrowid
#
#
# @app.on_event("startup")
# async def startup_event():
#     symbols = _parse_assets(APP_ASSETS)
#
#     # Per-asset overrides
#     price_map = _parse_map(INITIAL_PRICE_MAP_SPEC)
#     dt_map = _parse_map(DT_MAP_SPEC)
#     impact_map = _parse_map(IMPACT_MAP_SPEC)
#
#     # Holders on app.state
#     app.state.asset_ids: Dict[str, int] = {}
#     app.state.engines: Dict[str, PriceEngine] = {}
#     app.state.schedulers: Dict[str, Scheduler] = {}
#     app.state.scheduler_tasks: Dict[str, asyncio.Task] = {}
#
#     for symbol, name in symbols:
#         asset_id = _ensure_asset(symbol, name)
#
#         # Engine parameters (per-asset override -> fallback to global)
#         initial_price = price_map.get(symbol, ENGINE_INITIAL_PRICE)
#         dt = dt_map.get(symbol, ENGINE_DT)
#         impact_coeff = impact_map.get(symbol, IMPACT_COEFF)
#
#         # Build processes and engine
#         brownian = BrownianMotion(mu=0.005, sigma=0.02)
#         bdp = BirthDeathProcess(0.5, 0.5)
#         jump = JumpProcess(0.02, 0.02)
#
#         engine = PriceEngine(
#             initial_price=initial_price,
#             brownian=brownian,
#             birth_death=bdp,
#             jump=jump,
#             impact_coeff=impact_coeff,
#             # order_repo auto-instantiated inside
#             debug=True,
#         )
#
#         # Scheduler uses per-asset dt and batch size
#         scheduler = Scheduler(
#             engine=engine,
#             asset_id=asset_id,
#             dt=dt,
#             batch_size=SCHEDULER_BATCH_SIZE,
#             debug=True,
#         )
#         task = asyncio.create_task(scheduler.run())
#
#         # Save refs
#         app.state.asset_ids[symbol] = asset_id
#         app.state.engines[symbol] = engine
#         app.state.schedulers[symbol] = scheduler
#         app.state.scheduler_tasks[symbol] = task
#
#     # Optional default for routes that rely on a single asset_id
#     if symbols:
#         app.state.asset_id = app.state.asset_ids[symbols[0][0]]
#
#
# @app.on_event("shutdown")
# async def shutdown_event():
#     for scheduler in getattr(app.state, "schedulers", {}).values():
#         scheduler.stop()
#     for task in getattr(app.state, "scheduler_tasks", {}).values():
#         task.cancel()
#     for task in getattr(app.state, "scheduler_tasks", {}).values():
#         try:
#             await task
#         except asyncio.CancelledError:
#             pass
