import sqlite3
from app.config import DB_PATH

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

class Database:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self._init_db()

    def _init_db(self):
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            price REAL NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            price REAL NOT NULL,
            quantity REAL NOT NULL,
            side TEXT NOT NULL,
            user_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            side TEXT,              -- 'bid' or 'ask'
            price REAL,
            quantity REAL,
            status TEXT,            -- 'open', 'filled', 'cancelled'
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            balance REAL NOT NULL
        );
        """)
        self.conn.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            user_id INTEGER,
            quantity REAL NOT NULL,
            PRIMARY KEY (user_id)
        );
        """)
        self.conn.commit()

db = Database()