import asyncio
from engine.processes.brownian import BrownianMotion
from engine.processes.birth_death import BirthDeathProcess
from engine.processes.jump import JumpProcess
from engine.price_engine import PriceEngine
from engine.scheduler import Scheduler
from app.storage.order_repository import OrderRepository
from app.storage.user_repository import UserRepository
from app.config import *

async def main():
    clear_tables(DB_PATH)

    # 1) Setup stochastic processes
    brownian = BrownianMotion(mu=0.005, sigma=0.02)
    bdp = BirthDeathProcess(lambda_birth=0.5, lambda_death=0.5)
    jump = JumpProcess(jump_up=0.02, jump_down=0.02)

    # 2) Initialize price engine
    engine = PriceEngine(initial_price=100, brownian=brownian, birth_death=bdp, jump=jump)

    # 3) Initialize services and repositories
    user_repository = UserRepository()
    order_repo = OrderRepository()

    # user_repository.create_user(username="Martin", balance=1000000.0)
    # user_repository.create_user(username="Sara", balance=1000000.0)

    # 4) Create  orders
    # Example: user_id=1 buys 10 units at price 80
    order_repo.create_order(user_id=1, asset_id=1, side="bid", price=80, quantity=10)
    # Example: user_id=2 sells 5 units at price 140
    order_repo.create_order(user_id=2, asset_id=1, side="ask", price=140, quantity=5)
    # Example: user_id=3 buys 20 units at price 95
    order_id3 = order_repo.create_order(user_id=3, asset_id=1, side="bid", price=95, quantity=20)
    # Example: user_id=3 CANCEL ORDER
    success = order_repo.cancel_order(order_id3, user_repository)
    if success:
        print(f"Order {order_id3} cancelled and refunded successfully.")
    else:
        print(f"Order {order_id3} could not be cancelled.")


    # 5) Initialize scheduler
    scheduler = Scheduler(
        engine=engine,
        asset_id=1,
        dt=0.5,
        order_repo=order_repo,
        user_repository=user_repository,
        debug=True
    )

    # 6) Run scheduler
    await scheduler.run()

if __name__ == "__main__":
    asyncio.run(main())