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
        ("AAPL", "Apple Inc.", 180.0, 0.0002, 0.004, 0.02, 0.02, 0.002, 0.002),
        ("GOOGL", "Alphabet Inc.", 140.0, 0.00025, 0.0045, 0.02, 0.02, 0.002, 0.002),
        ("TSLA", "Tesla Inc.", 220.0, 0.00035, 0.006, 0.03, 0.03, 0.003, 0.003),
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
    cursor = conn.cursor()
    tables = ["fills", "user_alerts", "orders", "price_history", "positions", "user_watchlist", "assets", "users"]  # add any other demo tables
    for table in tables:
        cursor.execute(f"DELETE FROM {table};")
        cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}';")  # reset AUTOINCREMENT
    conn.commit()
    conn.close()
