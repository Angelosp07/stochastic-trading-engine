import hashlib
import secrets

from app.storage.db import db


class UserRepository:
    def __init__(self):
        self.conn = db.conn

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
        return f"{salt}${digest.hex()}"

    @staticmethod
    def verify_password(password: str, encoded: str | None) -> bool:
        if not encoded or "$" not in encoded:
            return False
        salt, digest_hex = encoded.split("$", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
        return secrets.compare_digest(candidate.hex(), digest_hex)

    def create_user(self, username: str, balance: float, password: str | None = None):
        password_hash = self.hash_password(password) if password else None
        cursor = self.conn.execute(
            "INSERT INTO users (username, balance, password_hash) VALUES (?, ?, ?)",
            (username, balance, password_hash)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_user(self, user_id: int):
        cursor = self.conn.execute(
            "SELECT id, username, balance, created_at FROM users WHERE id=?",
            (user_id,)
        )
        return cursor.fetchone()

    def get_user_with_password(self, user_id: int):
        cursor = self.conn.execute(
            "SELECT id, username, balance, created_at, password_hash FROM users WHERE id=?",
            (user_id,)
        )
        return cursor.fetchone()

    def get_user_by_username(self, username: str):
        cursor = self.conn.execute(
            "SELECT id, username, balance, created_at FROM users WHERE lower(username)=lower(?) LIMIT 1",
            (username,)
        )
        return cursor.fetchone()

    def get_user_by_username_with_password(self, username: str):
        cursor = self.conn.execute(
            "SELECT id, username, balance, created_at, password_hash FROM users WHERE lower(username)=lower(?) LIMIT 1",
            (username,)
        )
        return cursor.fetchone()

    def search_users(self, query: str, exclude_user_id: int, limit: int = 10):
        like = f"%{query.strip().lower()}%"
        cursor = self.conn.execute(
            """
            SELECT id, username, balance, created_at
            FROM users
            WHERE id != ? AND lower(username) LIKE ?
            ORDER BY username ASC
            LIMIT ?
            """,
            (exclude_user_id, like, limit),
        )
        return cursor.fetchall()

    def get_or_create_user(self, username: str, balance: float = 100000.0):
        existing = self.get_user_by_username(username)
        if existing:
            return existing
        self.create_user(username=username, balance=balance, password="demo123")
        return self.get_user_by_username(username)

    def authenticate(self, username: str, password: str):
        row = self.get_user_by_username_with_password(username)
        if not row:
            return None
        if not self.verify_password(password, row[4]):
            return None
        return row[:4]

    def add_watchlist_asset(self, user_id: int, asset_id: int):
        self.conn.execute(
            "INSERT OR IGNORE INTO user_watchlist (user_id, asset_id) VALUES (?, ?)",
            (user_id, asset_id),
        )
        self.conn.commit()

    def remove_watchlist_asset(self, user_id: int, asset_id: int):
        self.conn.execute(
            "DELETE FROM user_watchlist WHERE user_id=? AND asset_id=?",
            (user_id, asset_id),
        )
        self.conn.commit()

    def get_watchlist(self, user_id: int):
        cursor = self.conn.execute(
            """
            SELECT a.id, a.symbol, a.name
            FROM user_watchlist uw
            JOIN assets a ON a.id = uw.asset_id
            WHERE uw.user_id = ?
            ORDER BY uw.created_at ASC
            """,
            (user_id,),
        )
        return cursor.fetchall()

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
