from app.storage.db import db


class PriceRepository:
    def __init__(self):
        self.conn = db.conn

    def insert_price(self, price: float):
        self.conn.execute(
            "INSERT INTO price_history (price) VALUES (?)",
            (price,)
        )
        self.conn.commit()

    def insert_prices_batch(self, prices):
        self.conn.executemany(
            "INSERT INTO price_history (price) VALUES (?)",
            [(p,) for p in prices]
        )
        self.conn.commit()

    def get_last_n(self, n: int = 100):
        cursor = self.conn.execute(
            "SELECT price, timestamp FROM price_history ORDER BY id DESC LIMIT ?",
            (n,)
        )
        return cursor.fetchall()

    def get_all(self):
        cursor = self.conn.execute(
            "SELECT price, timestamp FROM price_history ORDER BY id ASC"
        )
        return cursor.fetchall()