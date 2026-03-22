import numpy as np


class BirthDeathProcess:
    def __init__(self, lambda_birth: float, lambda_death: float):
        self.lambda_birth = lambda_birth
        self.lambda_death = lambda_death

    def step(self, dt: float) -> int:
        """
        Returns:
        +1 → birth (positive event)
        -1 → death (negative event)
         0 → no event
        """
        if np.random.rand() < self.lambda_birth * dt:
            return 1
        elif np.random.rand() < self.lambda_death * dt:
            return -1
        return 0