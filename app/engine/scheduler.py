import asyncio
from app.storage.price_repository import PriceRepository

class Scheduler:
    def __init__(self, engine, dt=0.05):
        self.engine = engine
        self.dt = dt
        self.running = False
        self.repo = PriceRepository()

    async def run(self):
        self.running = True
        while self.running:
            price = self.engine.step(self.dt)
            print(f"Price: {price:.4f}")

            # save price to DB
            self.repo.insert_price(price)

            await asyncio.sleep(self.dt)

    def stop(self):
        self.running = False