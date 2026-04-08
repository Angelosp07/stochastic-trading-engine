from app.storage.db import db

class PositionRepository:
    def __init__(self):
        self.conn = db.conn

    def get_position_row(self, user_id: int, asset_id: int):
        cursor = self.conn.execute(
            """
            SELECT quantity, avg_entry_price, cost_basis, realized_pnl
            FROM positions
            WHERE user_id=? AND asset_id=?
            """,
            (user_id, asset_id)
        )
        result = cursor.fetchone()
        if not result:
            return {
                "quantity": 0.0,
                "avg_entry_price": 0.0,
                "cost_basis": 0.0,
                "realized_pnl": 0.0,
            }
        return {
            "quantity": float(result[0] or 0.0),
            "avg_entry_price": float(result[1] or 0.0),
            "cost_basis": float(result[2] or 0.0),
            "realized_pnl": float(result[3] or 0.0),
        }

    def get_position(self, user_id: int, asset_id: int) -> float:
        """Get the quantity of a specific asset for a user."""
        cursor = self.conn.execute(
            "SELECT quantity FROM positions WHERE user_id=? AND asset_id=?",
            (user_id, asset_id)
        )
        result = cursor.fetchone()
        return result[0] if result else 0.0

    def update_position(self, user_id: int, asset_id: int, delta_quantity: float):
        """
        Update a user's position for a specific asset.
        delta_quantity: positive for buy, negative for sell.
        """
        self.conn.execute("""
            INSERT INTO positions (user_id, asset_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, asset_id)
            DO UPDATE SET quantity = quantity + excluded.quantity
        """, (user_id, asset_id, delta_quantity))
        self.conn.commit()

    def apply_fill(self, user_id: int, asset_id: int, side: str, quantity: float, execution_price: float, fee: float = 0.0):
        state = self.get_position_row(user_id, asset_id)
        current_qty = state["quantity"]
        cost_basis = state["cost_basis"]
        realized_pnl = state["realized_pnl"]
        quantity = float(quantity)
        execution_price = float(execution_price)
        fee = float(fee)

        if side == "buy":
            next_qty = current_qty + quantity
            next_cost_basis = cost_basis + (quantity * execution_price) + fee
            avg_entry = next_cost_basis / next_qty if next_qty > 0 else 0.0
            next_realized = realized_pnl
        elif side == "sell":
            if quantity > current_qty + 1e-9:
                raise ValueError("insufficient position quantity")
            avg_entry = (cost_basis / current_qty) if current_qty > 0 else 0.0
            cost_removed = avg_entry * quantity
            proceeds = (quantity * execution_price) - fee
            realized_delta = proceeds - cost_removed
            next_qty = max(0.0, current_qty - quantity)
            next_cost_basis = max(0.0, cost_basis - cost_removed)
            if next_qty <= 1e-9:
                next_qty = 0.0
                next_cost_basis = 0.0
                avg_entry = 0.0
            else:
                avg_entry = next_cost_basis / next_qty
            next_realized = realized_pnl + realized_delta
        else:
            raise ValueError("side must be buy or sell")

        self.conn.execute(
            """
            INSERT INTO positions (user_id, asset_id, quantity, avg_entry_price, cost_basis, realized_pnl, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, asset_id)
            DO UPDATE SET
                quantity = excluded.quantity,
                avg_entry_price = excluded.avg_entry_price,
                cost_basis = excluded.cost_basis,
                realized_pnl = excluded.realized_pnl,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, asset_id, next_qty, avg_entry, next_cost_basis, next_realized)
        )
        self.conn.commit()
        return {
            "quantity": next_qty,
            "avg_entry_price": avg_entry,
            "cost_basis": next_cost_basis,
            "realized_pnl": next_realized,
        }

    def get_positions_for_user(self, user_id: int):
        cursor = self.conn.execute(
            """
            SELECT p.user_id, p.asset_id, a.symbol, a.name, p.quantity
            FROM positions p
            JOIN assets a ON a.id = p.asset_id
            WHERE p.user_id = ? AND p.quantity > 0
            ORDER BY a.symbol ASC
            """,
            (user_id,),
        )
        return cursor.fetchall()

    def get_positions_for_user_detailed(self, user_id: int):
        cursor = self.conn.execute(
            """
            SELECT
                p.user_id,
                p.asset_id,
                a.symbol,
                a.name,
                p.quantity,
                p.avg_entry_price,
                p.cost_basis,
                p.realized_pnl
            FROM positions p
            JOIN assets a ON a.id = p.asset_id
            WHERE p.user_id = ? AND p.quantity > 0
            ORDER BY a.symbol ASC
            """,
            (user_id,),
        )
        return cursor.fetchall()