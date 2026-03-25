from app.storage.db import db
from app.storage.position_repository import PositionRepository
from app.storage.user_repository import UserRepository


class OrderRepository:
    def __init__(self):
        self.conn = db.conn

    # Create a new order
    def create_order(self, user_id: int, asset_id: int, side: str, price: float, quantity: float):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO orders (user_id, asset_id, side, price, quantity, status)
            VALUES (?, ?, ?, ?, ?, 'open')
            """,
            (user_id, asset_id, side, price, quantity)
        )
        order_id = cursor.lastrowid
        self.conn.commit()
        return order_id

    # Get an order by ID
    def get_order(self, order_id: int):
        return self.conn.execute(
            "SELECT id, user_id, asset_id, side, price, quantity, status, timestamp FROM orders WHERE id=?",
            (order_id,)
        ).fetchone()

    # Cancel an order (mark as cancelled)
    def cancel_order(self, order_id: int, user_repo: UserRepository):
        """
        Cancel an open order and refund the user's balance (for bids) or restore shares (for asks).
        """
        order = self.get_order(order_id)
        if not order or order[6] != "open":  # status index 6
            return False

        user_id = order[1]  # user_id
        side = order[3]  # 'bid' or 'ask'
        price = order[4]
        quantity = order[5]

        # Refund logic
        if side == "bid":
            # Refund the locked funds
            refund_amount = price * quantity
            user_repo.update_balance(user_id, refund_amount)
        elif side == "ask":
            # Optional: return shares to user position if you locked them
            user_repo.update_position(user_id, order[2], quantity)  # asset_id at index 2

        # Mark order as cancelled
        self.conn.execute(
            "UPDATE orders SET status='cancelled' WHERE id=?",
            (order_id,)
        )
        self.conn.commit()
        return True

    # Close an order (mark as filled)
    def close_order(self, order_id: int):
        order = self.get_order(order_id)
        if not order or order[6] != "open":
            return False
        self.conn.execute(
            "UPDATE orders SET status='filled' WHERE id=?",
            (order_id,)
        )
        self.conn.commit()
        return True

    # Get all open orders by side
    def get_orders_by_side(self, side: str):
        cursor = self.conn.execute(
            "SELECT id, user_id, asset_id, price, quantity, status, timestamp FROM orders WHERE side=? AND status='open'",
            (side,)
        )
        return cursor.fetchall()

    def match_orders(self, asset_id: int, current_price: float, user_repository: UserRepository, position_repository: PositionRepository):
        """
        Check all open orders for the given asset against the current price.
        Execute and close orders when the price condition is met.

        user_service: an object that provides update_position and update_balance methods
        """
        # Fetch all open buy and sell orders for this asset
        open_orders = self.conn.execute(
            "SELECT id, user_id, side, price, quantity FROM orders WHERE asset_id=? AND status='open'",
            (asset_id,)
        ).fetchall()

        for order in open_orders:
            order_id, user_id, side, order_price, quantity = order

            if side == "bid" and current_price <= order_price:
                # Execute buy
                total_cost = quantity * order_price
                user_repository.update_balance(user_id, -total_cost)
                position_repository.update_position(user_id, asset_id, quantity)
                self.close_order(order_id)

            elif side == "ask" and current_price >= order_price:
                # Execute sell
                total_gain = quantity * order_price
                user_repository.update_balance(user_id, total_gain)
                position_repository.update_position(user_id, asset_id, -quantity)
                self.close_order(order_id)