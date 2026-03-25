import sqlite3
from app.config import DB_PATH

# Ensure the folder exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.execute("PRAGMA foreign_keys = ON")  # enforce FK constraints
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()

        # Users
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            balance REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Assets
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        );
        """)

        # Price History
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            price REAL NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        """)

        # Orders
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            side TEXT NOT NULL, -- 'bid' or 'ask'
            price REAL,
            quantity REAL,
            status TEXT, -- 'open', 'filled', 'cancelled'
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        """)

        # Positions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            user_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, asset_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        """)

        self.conn.commit()

# Single instance for app-wide use
db = Database()