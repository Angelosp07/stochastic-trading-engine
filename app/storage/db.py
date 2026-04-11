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

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_user_id INTEGER NOT NULL,
            receiver_user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_sender_receiver_created ON chat_messages(sender_user_id, receiver_user_id, created_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_receiver_sender_created ON chat_messages(receiver_user_id, sender_user_id, created_at)"
        )

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_user_id INTEGER NOT NULL,
            seller_user_id INTEGER NOT NULL,
            asset_symbol TEXT NOT NULL,
            quantity_kg REAL NOT NULL,
            purity_pct REAL NOT NULL,
            price_per_kg REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            delivery_terms TEXT,
            origin_port TEXT,
            destination_port TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            agreed_at DATETIME,
            buyer_signed_at DATETIME,
            seller_signed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        contract_columns = {
            row[1] for row in self.conn.execute("PRAGMA table_info(contracts)").fetchall()
        }
        if "buyer_signed_at" not in contract_columns:
            cursor.execute("ALTER TABLE contracts ADD COLUMN buyer_signed_at DATETIME")
        if "seller_signed_at" not in contract_columns:
            cursor.execute("ALTER TABLE contracts ADD COLUMN seller_signed_at DATETIME")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS contract_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            actor_user_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ports (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            max_draft_m REAL NOT NULL,
            max_beam_m REAL NOT NULL,
            max_loa_m REAL NOT NULL,
            crane_capacity_tons REAL NOT NULL DEFAULT 0,
            latitude REAL,
            longitude REAL
        );
        """)

        port_columns = {
            row[1] for row in self.conn.execute("PRAGMA table_info(ports)").fetchall()
        }
        if "latitude" not in port_columns:
            cursor.execute("ALTER TABLE ports ADD COLUMN latitude REAL")
        if "longitude" not in port_columns:
            cursor.execute("ALTER TABLE ports ADD COLUMN longitude REAL")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS freight_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin_port TEXT NOT NULL,
            destination_port TEXT NOT NULL,
            usd_per_ton REAL NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (origin_port, destination_port),
            FOREIGN KEY (origin_port) REFERENCES ports(code),
            FOREIGN KEY (destination_port) REFERENCES ports(code)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS vessels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            imo TEXT UNIQUE,
            vessel_class TEXT NOT NULL,
            draft_m REAL NOT NULL,
            beam_m REAL NOT NULL,
            loa_m REAL NOT NULL,
            max_cargo_tons REAL NOT NULL,
            operator_name TEXT,
            available_from DATETIME,
            status TEXT NOT NULL DEFAULT 'available'
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            vessel_id INTEGER,
            broker_name TEXT,
            origin_port TEXT,
            destination_port TEXT,
            status TEXT NOT NULL DEFAULT 'planned',
            eta DATETIME,
            current_lat REAL,
            current_lon REAL,
            last_position_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
            FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE SET NULL,
            FOREIGN KEY (origin_port) REFERENCES ports(code),
            FOREIGN KEY (destination_port) REFERENCES ports(code)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS shipment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT,
            latitude REAL,
            longitude REAL,
            eta DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
        );
        """)

        cursor.executemany(
            """
            INSERT OR IGNORE INTO ports (code, name, country, max_draft_m, max_beam_m, max_loa_m, crane_capacity_tons)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("NLRTM", "Rotterdam", "Netherlands", 23.0, 70.0, 400.0, 120.0),
                ("SGSIN", "Singapore", "Singapore", 22.0, 68.0, 400.0, 100.0),
                ("USHOU", "Houston", "USA", 15.0, 45.0, 300.0, 90.0),
                ("KRPUS", "Busan", "South Korea", 17.0, 50.0, 330.0, 95.0),
                ("CNNGB", "Ningbo", "China", 18.0, 55.0, 350.0, 110.0),
            ],
        )

        cursor.executemany(
            """
            UPDATE ports
            SET latitude = ?, longitude = ?
            WHERE code = ?
            """,
            [
                (51.95, 4.14, "NLRTM"),
                (1.26, 103.84, "SGSIN"),
                (29.73, -95.27, "USHOU"),
                (35.10, 129.04, "KRPUS"),
                (29.93, 121.84, "CNNGB"),
            ],
        )

        cursor.executemany(
            """
            INSERT OR IGNORE INTO freight_rates (origin_port, destination_port, usd_per_ton)
            VALUES (?, ?, ?)
            """,
            [
                ("NLRTM", "SGSIN", 84.0),
                ("NLRTM", "KRPUS", 91.0),
                ("USHOU", "SGSIN", 103.0),
                ("CNNGB", "SGSIN", 39.0),
                ("CNNGB", "KRPUS", 27.0),
            ],
        )

        cursor.executemany(
            """
            INSERT OR IGNORE INTO vessels (name, imo, vessel_class, draft_m, beam_m, loa_m, max_cargo_tons, operator_name, available_from, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'available')
            """,
            [
                ("MV Rare Venture", "9380011", "Handysize", 10.8, 32.0, 180.0, 28000.0, "Mineral Freight Co."),
                ("MV Cobalt Arrow", "9410022", "Supramax", 12.5, 36.0, 200.0, 52000.0, "BlueOcean Brokers"),
                ("MV Lithium Dawn", "9520033", "Panamax", 14.0, 43.0, 230.0, 76000.0, "BulkRoute Shipping"),
            ],
        )

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_contracts_users_created ON contracts(buyer_user_id, seller_user_id, created_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_shipments_contract_status ON shipments(contract_id, status, created_at)"
        )

        self.conn.commit()

# Single instance for app-wide use
db = Database()
