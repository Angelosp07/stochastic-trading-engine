import asyncio
from engine.processes.brownian import BrownianMotion
from engine.processes.birth_death import BirthDeathProcess
from engine.processes.jump import JumpProcess
from engine.price_engine import PriceEngine
from engine.scheduler import Scheduler
from storage.redis_client import clear_order_book


async def main():
    clear_order_book()  # start fresh

    brownian = BrownianMotion(mu=0.005, sigma=0.02)
    bdp = BirthDeathProcess(lambda_birth=0.5, lambda_death=0.5)
    jump = JumpProcess(jump_up=0.02, jump_down=0.02)

    engine = PriceEngine(initial_price=100, brownian=brownian, birth_death=bdp, jump=jump)

    # # simulate some large buy orders
    # add_order("bid", 100, 500, user_id=1)  # big buy
    # add_order("ask", 105, 300, user_id=2)  # some sells

    scheduler = Scheduler(engine, dt=0.1)
    await scheduler.run()

if __name__ == "__main__":
    asyncio.run(main())

    # repo = PriceRepository()
    #
    # history = repo.get_last_n(10)
    #
    # print("\nLast 10 prices:")
    # for price, ts in history:
    #     print(ts, price)