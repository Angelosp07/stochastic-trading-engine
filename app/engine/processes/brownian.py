import numpy as np


class BrownianMotion:
    def __init__(self, mu: float, sigma: float):
        self.mu = mu
        self.sigma = sigma

    def step(self, dt: float) -> float:
        """
        Returns log-return increment
        """
        z = np.random.randn()
        return (self.mu - 0.5 * self.sigma**2) * dt + self.sigma * np.sqrt(dt) * z