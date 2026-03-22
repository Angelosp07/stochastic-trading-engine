# app/main.py
from fastapi import FastAPI
import asyncio

from app.api.routes import price, orders, history, user
from app.api import websocket

from app.engine.price_engine import PriceEngine
from app.engine.processes.brownian import BrownianMotion
from app.engine.processes.birth_death import BirthDeathProcess
from app.engine.processes.jump import JumpProcess
from app.engine.scheduler import Scheduler

app = FastAPI(title="Stochastic Trading Engine")

# include routers
app.include_router(user.router)
app.include_router(price.router)
app.include_router(orders.router)
app.include_router(history.router)
app.include_router(websocket.router)


@app.on_event("startup")
async def startup_event():
    # create engine
    brownian = BrownianMotion(mu=0.005, sigma=0.02)
    bdp = BirthDeathProcess(0.5, 0.5)
    jump = JumpProcess(0.02, 0.02)

    engine = PriceEngine(100, brownian, bdp, jump)

    # store in app state
    app.state.engine = engine

    # start scheduler
    scheduler = Scheduler(engine)
    asyncio.create_task(scheduler.run())