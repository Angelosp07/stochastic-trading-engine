import asyncio
from typing import Optional
from app.storage.order_repository import OrderRepository
from app.storage.position_repository import PositionRepository
from app.storage.price_repository import PriceRepository
from app.storage.user_repository import UserRepository

class Scheduler:
    """
    Scheduler that drives the price engine and matches orders in real-time.
    """
    def __init__(
        self,
        engine,
        asset_id: int,
        order_repo: Optional[OrderRepository] = None,
        price_repo: Optional[PriceRepository] = None,
        position_repository: Optional[PositionRepository] = None,
        user_repository: Optional[UserRepository] = None,
        dt: float = 0.5,
        debug: bool = True
    ):
        self.engine = engine
        self.asset_id = int(asset_id)
        self.order_repo = order_repo or OrderRepository()
        self.price_repo = price_repo or PriceRepository()
        self.position_repository = position_repository or PositionRepository()
        self.user_repository = user_repository or UserRepository()
        self.dt = dt
        self.debug = debug
        self.running = False

    async def run(self):
        self.running = True
        try:
            while self.running:
                # Generate next price
                price = self.engine.step(self.dt)

                # Save price to DB
                self.price_repo.insert_price(self.asset_id, price)

                # Match orders against current price
                self.order_repo.match_orders(
                    asset_id=self.asset_id,
                    current_price=price,
                    user_repository=self.user_repository,
                    position_repository=self.position_repository
                )

                await asyncio.sleep(self.dt)
        except asyncio.CancelledError:
            pass
        finally:
            self.running = False

    def stop(self):
        self.running = False