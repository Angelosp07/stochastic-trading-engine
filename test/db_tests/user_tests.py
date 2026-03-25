import pytest
from app.storage.user_repository import UserRepository

@pytest.fixture
def repo():
    return UserRepository()

def test_user_crud(repo):
    # Create
    user_id = repo.create_user("bob", 100.0)
    assert user_id is not None

    # Read
    user = repo.get_user(user_id)
    assert user[1] == "bob"
    assert user[2] == 100.0

    # Update balance increment
    repo.update_balance(user_id, 50)
    user = repo.get_user(user_id)
    assert user[2] == 150.0

    # Update balance decrement
    repo.update_balance(user_id, -30)
    user = repo.get_user(user_id)
    assert user[2] == 120.0

    # Direct set
    repo.set_balance(user_id, 500)
    user = repo.get_user(user_id)
    assert user[2] == 500