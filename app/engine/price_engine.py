import numpy as np

class PriceEngine:
    """
    Simplified price engine using only stochastic processes:
      1) Continuous diffusion (Brownian)
      2) Discrete jumps (Birth-Death process)

    Parameters
    ----------
    initial_price : float
        Starting price.
    brownian : object
        Must expose step(dt: float) -> float (log-return increment).
    birth_death : object
        Must expose step(dt: float) -> event (domain-specific).
    jump : object
        Must expose apply(price: float, event) -> float (applies the discrete jump).
    debug : bool
        If True, prints debug lines.
    """
    def __init__(
        self,
        initial_price: float,
        brownian,
        birth_death,
        jump,
        debug: bool = True,
    ):
        self.price = float(initial_price)
        self.brownian = brownian
        self.birth_death = birth_death
        self.jump = jump
        self.debug = debug

    def step(self, dt: float) -> float:
        # 1) Continuous diffusion (geometric via log-normal increment)
        diffusion = self.brownian.step(dt)
        new_price = self.price * float(np.exp(diffusion))

        # 2) Discrete jump via birth-death event
        event = self.birth_death.step(dt)
        new_price = self.jump.apply(new_price, event)

        # Debug prints
        if self.debug:
            print(f"[DEBUG] Price: {self.price:.4f}, diffusion: {diffusion:.5f}, event: {event}")

        # Update price (floor at a small epsilon to avoid zero/negative)
        self.price = max(float(new_price), 0.01)
        return self.price