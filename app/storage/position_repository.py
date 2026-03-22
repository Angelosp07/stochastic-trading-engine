from app.storage.db import db

class PositionRepository:
    def __init__(self):
        self.conn = db.conn

    def get_position(self, user_id):
        cursor = self.conn.execute(
            "SELECT quantity FROM positions WHERE user_id=?",
            (user_id,)
        )
        result = cursor.fetchone()
        return result[0] if result else 0

    def update_position(self, user_id, new_quantity):
        if self.get_position(user_id) == 0:
            self.conn.execute(
                "INSERT INTO positions (user_id, quantity) VALUES (?, ?)",
                (user_id, new_quantity)
            )
        else:
            self.conn.execute(
                "UPDATE positions SET quantity=? WHERE user_id=?",
                (new_quantity, user_id)
            )
        self.conn.commit()