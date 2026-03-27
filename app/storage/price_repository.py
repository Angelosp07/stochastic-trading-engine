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

    def insert_price_with_timestamp(self, asset_id: int, price: float, timestamp: str):
        self.conn.execute(
            "INSERT INTO price_history (asset_id, price, timestamp) VALUES (?, ?, ?)",
            (asset_id, price, timestamp)
        )
        self.conn.commit()

    def insert_many_with_timestamps(self, rows):
        self.conn.executemany(
            "INSERT INTO price_history (asset_id, price, timestamp) VALUES (?, ?, ?)",
            rows
        )
        self.conn.commit()

    def clear_asset_history(self, asset_id: int):
        self.conn.execute("DELETE FROM price_history WHERE asset_id = ?", (asset_id,))
        self.conn.commit()

    def asset_exists(self, asset_id: int) -> bool:
        row = self.conn.execute("SELECT 1 FROM assets WHERE id = ? LIMIT 1", (asset_id,)).fetchone()
        return row is not None

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
