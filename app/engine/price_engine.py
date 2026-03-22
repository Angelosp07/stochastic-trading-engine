import numpy as np
from app.storage.redis_client import net_demand, print_order_book

class PriceEngine:
    def __init__(self, initial_price, brownian, birth_death, jump, impact_coeff=0.001):
        self.price = initial_price
        self.brownian = brownian
        self.birth_death = birth_death
        self.jump = jump
        self.impact_coeff = impact_coeff

    def step(self, dt: float) -> float:
        # 1. Continuous evolution
        diffusion = self.brownian.step(dt)
        new_price = self.price * np.exp(diffusion)

        # 2. Discrete jump (BDP)
        event = self.birth_death.step(dt)
        new_price = self.jump.apply(new_price, event)

        # 3. Market impact from order book
        demand = net_demand() / 100  # normalize
        impact = self.impact_coeff * demand
        new_price *= 1 + impact

        # Debug prints
        print(f"[DEBUG] Price before impact: {self.price:.4f}, diffusion: {diffusion:.5f}, event: {event}")
        print(f"[DEBUG] Net demand: {demand*100:.0f}, Market impact factor: {impact:.5f}")
        print_order_book()
        print("-" * 50)

        # update price
        self.price = max(new_price, 0.01)
        return self.price