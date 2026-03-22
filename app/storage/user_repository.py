from app.storage.db import db

class UserRepository:
    def __init__(self):
        self.conn = db.conn

    def create_user(self, username, balance):
        cursor = self.conn.execute(
            "INSERT INTO users (username, balance) VALUES (?, ?)",
            (username, balance)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_user(self, user_id):
        cursor = self.conn.execute(
            "SELECT id, username, balance FROM users WHERE id=?",
            (user_id,)
        )
        return cursor.fetchone()

    def update_balance(self, user_id, new_balance):
        self.conn.execute(
            "UPDATE users SET balance=? WHERE id=?",
            (new_balance, user_id)
        )
        self.conn.commit()