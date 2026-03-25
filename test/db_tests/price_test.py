import pytest
from app.storage.price_repository import PriceRepository
from app.storage.user_repository import UserRepository
from app.storage.db import db


@pytest.fixture(autouse=True)
def reset_db():
    db.conn.execute("DROP TABLE IF EXISTS price_history")
    db.conn.execute("DROP TABLE IF EXISTS assets")
    db.conn.commit()
    db._init_db()

@pytest.fixture
def repo():
    return PriceRepository()


@pytest.fixture
def asset_id():
    """
    Create a test asset because price_history requires a valid asset_id (FK).
    """
    cursor = db.conn.execute(
        "INSERT INTO assets (symbol, name) VALUES (?, ?)",
        ("TEST", "Test Asset")
    )
    db.conn.commit()
    return cursor.lastrowid


def test_insert_price(repo, asset_id):
    repo.insert_price(asset_id, 100.0)

    data = repo.get_all(asset_id)
    assert len(data) == 1
    assert data[0][0] == 100.0  # price


def test_insert_prices_batch(repo, asset_id):
    prices = [100.0, 101.5, 102.3]
    repo.insert_prices_batch(asset_id, prices)

    data = repo.get_all(asset_id)
    assert len(data) == 3
    assert [row[0] for row in data] == prices


def test_get_last_n(repo, asset_id):
    prices = [1, 2, 3, 4, 5]
    repo.insert_prices_batch(asset_id, prices)

    last_two = repo.get_last_n(asset_id, 2)

    assert len(last_two) == 2
    assert [row[0] for row in last_two] == [5, 4]  # DESC order


def test_get_all_order(repo, asset_id):
    prices = [10, 20, 30]
    repo.insert_prices_batch(asset_id, prices)

    data = repo.get_all(asset_id)

    assert len(data) == 3
    assert [row[0] for row in data] == prices  # ASC order


def test_empty_asset(repo):
    """
    Querying non-existing asset should return empty list
    """
    data = repo.get_all(99999)
    assert data == []