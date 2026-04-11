from pathlib import Path
import hashlib
import secrets
import sqlite3

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "storage" / "market.db"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"{salt}${digest.hex()}"


def seed_assets(conn):
    assets = [
        ("NDOX", "Neodymium Oxide", 92.0, 0.00018, 0.0038, 0.019, 0.019, 0.0018, 0.0018),
        ("PROX", "Praseodymium Oxide", 87.0, 0.0002, 0.0041, 0.02, 0.02, 0.002, 0.002),
        ("DYOX", "Dysprosium Oxide", 365.0, 0.00028, 0.0052, 0.024, 0.024, 0.0026, 0.0026),
        ("LI2CO3", "Lithium Carbonate", 17.5, 0.00024, 0.0062, 0.028, 0.028, 0.0032, 0.0032),
        ("COBM", "Cobalt Metal", 34.0, 0.00022, 0.0057, 0.026, 0.026, 0.003, 0.003),
        ("NIBQ", "Nickel Briquette", 19.0, 0.0002, 0.0051, 0.024, 0.024, 0.0028, 0.0028),
        ("MNSO4", "Manganese Sulfate", 1.8, 0.00019, 0.0046, 0.022, 0.022, 0.0023, 0.0023),
        ("GRPH", "Graphite Flake", 6.4, 0.00017, 0.0042, 0.021, 0.021, 0.0021, 0.0021),
        ("CUCA", "Copper Cathode", 4.3, 0.00016, 0.0039, 0.019, 0.019, 0.0019, 0.0019),
        ("AL99", "Aluminum 99.7%", 2.4, 0.00015, 0.0036, 0.018, 0.018, 0.0018, 0.0018),
        ("SN99", "Tin 99.9%", 32.0, 0.00021, 0.0048, 0.023, 0.023, 0.0025, 0.0025),
        ("TANT", "Tantalum Concentrate", 158.0, 0.00026, 0.0056, 0.027, 0.027, 0.0031, 0.0031),
        ("GALL", "Gallium 99.99%", 302.0, 0.00029, 0.0061, 0.029, 0.029, 0.0033, 0.0033),
        ("GERM", "Germanium Metal", 1480.0, 0.00031, 0.0065, 0.031, 0.031, 0.0035, 0.0035),
        ("SIMG", "Silicon Metal", 2.2, 0.00018, 0.0044, 0.021, 0.021, 0.0022, 0.0022),
    ]

    conn.executemany("""
        INSERT OR IGNORE INTO assets (symbol, name)
        VALUES (?, ?)
    """, [(a[0], a[1]) for a in assets])

    conn.commit()

    return {a[0]: {
        "initial_price": a[2],
        "mu": a[3],
        "sigma": a[4],
        "lambda_birth": a[5],
        "lambda_death": a[6],
        "jump_up": a[7],
        "jump_down": a[8],
    } for a in assets}


def seed_users(conn):
    """
    Seed demo users into the database.

    Returns a dictionary mapping username -> initial info.
    """
    users = [
        ("Martin", 1000000.0),
        ("Sara", 1000000.0),
        ("Alice", 500000.0),
        ("Bob", 750000.0)
    ]

    default_password_hash = hash_password("demo123")

    for username, balance in users:
        conn.execute(
            """
            INSERT OR IGNORE INTO users (username, balance, password_hash)
            VALUES (?, ?, ?)
            """,
            (username, balance, default_password_hash),
        )

    # Insert users into the DB
    conn.execute(
        """
        UPDATE users
        SET password_hash = ?
        WHERE password_hash IS NULL OR password_hash = ''
        """,
        (default_password_hash,),
    )

    conn.commit()

    # Return dictionary of initial values
    return {u[0]: {"balance": u[1]} for u in users}

def clear_tables(db_path: str = "app.db"):
    """
    Delete all rows from demo tables for a clean start.
    """
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()
    tables = [
        "shipment_events",
        "shipments",
        "contract_events",
        "contracts",
        "fills",
        "chat_messages",
        "user_alerts",
        "orders",
        "price_history",
        "positions",
        "user_watchlist",
        "vessels",
        "freight_rates",
        "ports",
        "assets",
        "users",
    ]
    for table in tables:
        cursor.execute(f"DELETE FROM {table};")
        cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}';")  # reset AUTOINCREMENT
    conn.commit()
    conn.close()
