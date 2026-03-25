from app.storage.db import db

class UserRepository:
    def __init__(self):
        self.conn = db.conn

    def create_user(self, username: str, balance: float):
        cursor = self.conn.execute(
            "INSERT INTO users (username, balance) VALUES (?, ?)",
            (username, balance)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_user(self, user_id: int):
        cursor = self.conn.execute(
            "SELECT id, username, balance, created_at FROM users WHERE id=?",
            (user_id,)
        )
        return cursor.fetchone()

    def update_balance(self, user_id: int, delta_balance: float):
        """
        Increment or decrement user's balance.
        Positive delta_balance for deposit/buy, negative for withdrawal/sell.
        """
        self.conn.execute("""
            UPDATE users
            SET balance = balance + ?
            WHERE id = ?
        """, (delta_balance, user_id))
        self.conn.commit()

    def set_balance(self, user_id: int, balance: float):
        """Directly set user's balance."""
        self.conn.execute(
            "UPDATE users SET balance=? WHERE id=?",
            (balance, user_id)
        )
        self.conn.commit()