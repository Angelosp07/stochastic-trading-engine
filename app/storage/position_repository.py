from app.storage.db import db

class PositionRepository:
    def __init__(self):
        self.conn = db.conn

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