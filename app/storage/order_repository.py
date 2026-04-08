from app.storage.db import db
from app.storage.position_repository import PositionRepository
from app.storage.user_repository import UserRepository


class OrderRepository:
    def __init__(self):
        self.conn = db.conn

    # Create a new order
    def create_order(
        self,
        user_id: int,
        asset_id: int,
        side: str,
        price: float,
        quantity: float,
        order_type: str = "market",
        stop_price: float | None = None,
        take_profit_price: float | None = None,
        limit_price: float | None = None,
    ):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO orders (user_id, asset_id, side, price, quantity, status, order_type, stop_price, take_profit_price, limit_price)
            VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
            """,
            (user_id, asset_id, side, price, quantity, order_type, stop_price, take_profit_price, limit_price)
        )
        order_id = cursor.lastrowid
        self.conn.commit()
        return order_id

    def create_filled_order(
        self,
        user_id: int,
        asset_id: int,
        side: str,
        price: float,
        quantity: float,
        order_type: str = "market",
        stop_price: float | None = None,
        take_profit_price: float | None = None,
        limit_price: float | None = None,
    ):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO orders (user_id, asset_id, side, price, quantity, status, order_type, stop_price, take_profit_price, limit_price)
            VALUES (?, ?, ?, ?, ?, 'filled', ?, ?, ?, ?)
            """,
            (user_id, asset_id, side, price, quantity, order_type, stop_price, take_profit_price, limit_price)
        )
        order_id = cursor.lastrowid
        self.conn.commit()
        return order_id

    def record_fill(
        self,
        user_id: int,
        asset_id: int,
        side: str,
        quantity: float,
        requested_price: float | None,
        execution_price: float,
        fee: float,
        slippage: float,
        order_type: str = "market",
        status: str = "filled",
        notes: str | None = None,
    ):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO fills (
                user_id, asset_id, side, quantity, requested_price,
                execution_price, fee, slippage, order_type, status, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                asset_id,
                side,
                quantity,
                requested_price,
                execution_price,
                fee,
                slippage,
                order_type,
                status,
                notes,
            ),
        )
        self.conn.commit()
        return cursor.lastrowid

    # Get an order by ID
    def get_order(self, order_id: int):
        return self.conn.execute(
            """
            SELECT id, user_id, asset_id, side, price, quantity, status, timestamp,
                   COALESCE(order_type, 'market'), stop_price, take_profit_price, limit_price
            FROM orders
            WHERE id=?
            """,
            (order_id,)
        ).fetchone()

    def get_orders_for_user(self, user_id: int, limit: int = 200):
        cursor = self.conn.execute(
            """
            SELECT o.id, o.user_id, o.asset_id, a.symbol, a.name, o.side, o.price, o.quantity,
                   o.status, o.timestamp, COALESCE(o.order_type, 'market')
            FROM orders o
            JOIN assets a ON a.id = o.asset_id
            WHERE o.user_id = ?
            ORDER BY o.id DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        return cursor.fetchall()

    def get_fills_for_user(self, user_id: int, limit: int = 500):
        cursor = self.conn.execute(
            """
            SELECT f.id, f.user_id, f.asset_id, a.symbol, a.name, f.side, f.quantity,
                   f.requested_price, f.execution_price, f.fee, f.slippage,
                   f.order_type, f.status, f.notes, f.timestamp
            FROM fills f
            JOIN assets a ON a.id = f.asset_id
            WHERE f.user_id = ?
            ORDER BY f.id DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        return cursor.fetchall()

    def update_open_order(self, order_id: int, quantity: float | None = None, limit_price: float | None = None):
        order = self.get_order(order_id)
        if not order or order[6] != "open":
            return None

        next_quantity = float(order[5]) if quantity is None else float(quantity)
        if next_quantity <= 0:
            return None

        next_limit = order[11] if limit_price is None else float(limit_price)

        self.conn.execute(
            "UPDATE orders SET quantity = ?, limit_price = ? WHERE id = ?",
            (next_quantity, next_limit, order_id),
        )
        self.conn.commit()
        return self.get_order(order_id)

    # Cancel an order (mark as cancelled)
    def cancel_order(self, order_id: int, _user_repo: UserRepository):
        """Cancel an open order by marking status as cancelled."""
        order = self.get_order(order_id)
        if not order or order[6] != "open":  # status index 6
            return False

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