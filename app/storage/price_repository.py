from app.storage.db import db

class PriceRepository:
    def __init__(self):
        self.conn = db.conn

    def insert_price(self, asset_id: int, price: float):
        self.conn.execute(
            "INSERT INTO price_history (asset_id, price) VALUES (?, ?)",
            (asset_id, price)
        )
        self.conn.commit()

    def get_last_n(self, asset_id: int, n: int = 100):
        cursor = self.conn.execute(
            "SELECT price, timestamp FROM price_history WHERE asset_id=? ORDER BY id DESC LIMIT ?",
            (asset_id, n)
        )
        return cursor.fetchall()

    def get_all(self, asset_id: int):
        cursor = self.conn.execute(
            "SELECT price, timestamp FROM price_history WHERE asset_id=? ORDER BY id ASC",
            (asset_id,)
        )
        return cursor.fetchall()