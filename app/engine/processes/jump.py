class JumpProcess:
    def __init__(self, jump_up: float, jump_down: float):
        self.jump_up = jump_up
        self.jump_down = jump_down

    def apply(self, price: float, event: int) -> float:
        """
        Applies jump based on event from BDP
        """
        if event == 1:
            return price * (1 + self.jump_up)
        elif event == -1:
            return price * (1 - self.jump_down)
        return price