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

        user_columns = {
            row[1] for row in self.conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "password_hash" not in user_columns:
            cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")

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

        order_columns = {
            row[1] for row in self.conn.execute("PRAGMA table_info(orders)").fetchall()
        }
        if "order_type" not in order_columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'market'")
        if "stop_price" not in order_columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN stop_price REAL")
        if "take_profit_price" not in order_columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN take_profit_price REAL")
        if "limit_price" not in order_columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN limit_price REAL")

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

        position_columns = {
            row[1] for row in self.conn.execute("PRAGMA table_info(positions)").fetchall()
        }
        if "avg_entry_price" not in position_columns:
            cursor.execute("ALTER TABLE positions ADD COLUMN avg_entry_price REAL NOT NULL DEFAULT 0")
        if "cost_basis" not in position_columns:
            cursor.execute("ALTER TABLE positions ADD COLUMN cost_basis REAL NOT NULL DEFAULT 0")
        if "realized_pnl" not in position_columns:
            cursor.execute("ALTER TABLE positions ADD COLUMN realized_pnl REAL NOT NULL DEFAULT 0")
        if "updated_at" not in position_columns:
            cursor.execute("ALTER TABLE positions ADD COLUMN updated_at DATETIME")
            cursor.execute("UPDATE positions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS fills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            side TEXT NOT NULL,
            quantity REAL NOT NULL,
            requested_price REAL,
            execution_price REAL NOT NULL,
            fee REAL NOT NULL DEFAULT 0,
            slippage REAL NOT NULL DEFAULT 0,
            order_type TEXT NOT NULL DEFAULT 'market',
            status TEXT NOT NULL DEFAULT 'filled',
            notes TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            condition TEXT NOT NULL,
            target_price REAL NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            triggered_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_watchlist (
            user_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, asset_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );
        """)

        self.conn.commit()

# Single instance for app-wide use
db = Database()