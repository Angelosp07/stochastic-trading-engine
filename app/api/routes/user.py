from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.storage.db import db
from app.storage.price_repository import PriceRepository
from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/users", tags=["users"])

user_repo = UserRepository()
price_repo = PriceRepository()

# ------------------------------
# Schemas
# ------------------------------
class UserCreate(BaseModel):
    username: str
    balance: float = 100000.0
    password: str | None = None


class SignupRequest(BaseModel):
    username: str
    password: str
    balance: float = 100000.0

class BalanceUpdate(BaseModel):
    delta_balance: float

class BalanceSet(BaseModel):
    balance: float

class LoginRequest(BaseModel):
    username: str
    password: str


class WatchlistAddRequest(BaseModel):
    asset_id: int

class UserOut(BaseModel):
    id: int
    username: str
    balance: float
    created_at: str


class WatchlistAssetOut(BaseModel):
    id: int
    symbol: str
    name: str


class AlertCreateRequest(BaseModel):
    asset_id: int
    condition: str
    target_price: float


class AlertOut(BaseModel):
    id: int
    user_id: int
    asset_id: int
    symbol: str
    condition: str
    target_price: float
    current_price: float | None = None
    is_active: bool
    triggered_at: str | None = None
    created_at: str


def _fetch_alert_rows(user_id: int):
    return db.conn.execute(
        """
        SELECT ua.id, ua.user_id, ua.asset_id, a.symbol, ua.condition, ua.target_price,
               ua.is_active, ua.triggered_at, ua.created_at
        FROM user_alerts ua
        JOIN assets a ON a.id = ua.asset_id
        WHERE ua.user_id = ?
        ORDER BY ua.id DESC
        """,
        (user_id,),
    ).fetchall()


def _evaluate_and_trigger_alerts(user_id: int):
    rows = _fetch_alert_rows(user_id)
    if not rows:
        return rows

    latest_prices = price_repo.get_latest_points_map([int(r[2]) for r in rows])
    alerts_to_trigger = []

    for row in rows:
        alert_id = int(row[0])
        asset_id = int(row[2])
        condition = row[4]
        target_price = float(row[5])
        is_active = bool(row[6])
        if not is_active:
            continue

        current_price = latest_prices.get(asset_id, {}).get("price")
        if current_price is None:
            continue

        if (condition == "above" and float(current_price) >= target_price) or (
            condition == "below" and float(current_price) <= target_price
        ):
            alerts_to_trigger.append(alert_id)

    if alerts_to_trigger:
        placeholders = ",".join(["?"] * len(alerts_to_trigger))
        db.conn.execute(
            f"""
            UPDATE user_alerts
            SET is_active = 0,
                triggered_at = COALESCE(triggered_at, CURRENT_TIMESTAMP)
            WHERE user_id = ? AND id IN ({placeholders})
            """,
            (user_id, *alerts_to_trigger),
        )
        db.conn.commit()
        rows = _fetch_alert_rows(user_id)

    return rows


def _to_user_out(row):
    return UserOut(
        id=row[0],
        username=row[1],
        balance=row[2],
        created_at=row[3]
    )


# ------------------------------
# Signup
# ------------------------------
@router.post("/signup", response_model=UserOut)
def signup(payload: SignupRequest):
    username = payload.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = user_repo.get_user_by_username(username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    try:
        user_id = user_repo.create_user(
            username=username,
            balance=payload.balance,
            password=payload.password
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create user") from exc

    row = user_repo.get_user(user_id)
    return _to_user_out(row)

# ------------------------------
# Create user
# ------------------------------
@router.post("/", response_model=int)
def create_user(user: UserCreate):
    user_id = user_repo.create_user(
        username=user.username,
        balance=user.balance,
        password=user.password
    )
    return user_id

# ------------------------------
# Login with existing SQL user
# ------------------------------
@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest):
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    row = user_repo.authenticate(username, payload.password)
    if not row:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return _to_user_out(row)

# ------------------------------
# Update balance (increment/decrement)
# ------------------------------
@router.post("/{user_id}/balance/update")
def update_balance(user_id: int, payload: BalanceUpdate):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_repo.update_balance(user_id, payload.delta_balance)

    return {
        "user_id": user_id,
        "delta": payload.delta_balance,
        "status": "updated"
    }

# ------------------------------
# Set balance directly
# ------------------------------
@router.post("/{user_id}/balance/set")
def set_balance(user_id: int, payload: BalanceSet):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_repo.set_balance(user_id, payload.balance)

    return {
        "user_id": user_id,
        "balance": payload.balance,
        "status": "set"
    }


# ------------------------------
# Demo login (creates Demo user if needed)
# ------------------------------
@router.post("/demo-login", response_model=UserOut)
def demo_login():
    row = user_repo.get_or_create_user(username="Demo", balance=100000.0)
    return _to_user_out(row)


@router.get("/search", response_model=list[UserOut])
def search_users(
    q: str = Query(..., min_length=1, max_length=64),
    exclude_user_id: int | None = None,
    limit: int = Query(10, ge=1, le=50),
):
    effective_exclude = int(exclude_user_id or -1)
    rows = user_repo.search_users(q, exclude_user_id=effective_exclude, limit=limit)
    return [_to_user_out(row) for row in rows]


# ------------------------------
# Get user
# ------------------------------
@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int):
    row = user_repo.get_user(user_id)

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return _to_user_out(row)


# ------------------------------
# Watchlist endpoints
# ------------------------------
@router.get("/{user_id}/watchlist", response_model=list[WatchlistAssetOut])
def get_watchlist(user_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rows = user_repo.get_watchlist(user_id)
    return [WatchlistAssetOut(id=row[0], symbol=row[1], name=row[2]) for row in rows]


@router.post("/{user_id}/watchlist", response_model=list[WatchlistAssetOut])
def add_watchlist_item(user_id: int, payload: WatchlistAddRequest):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not price_repo.asset_exists(payload.asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    user_repo.add_watchlist_asset(user_id, payload.asset_id)
    rows = user_repo.get_watchlist(user_id)
    return [WatchlistAssetOut(id=row[0], symbol=row[1], name=row[2]) for row in rows]


@router.delete("/{user_id}/watchlist/{asset_id}", response_model=list[WatchlistAssetOut])
def remove_watchlist_item(user_id: int, asset_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_repo.remove_watchlist_asset(user_id, asset_id)
    rows = user_repo.get_watchlist(user_id)
    return [WatchlistAssetOut(id=row[0], symbol=row[1], name=row[2]) for row in rows]


@router.get("/{user_id}/alerts", response_model=list[AlertOut])
def get_alerts(user_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    rows = _evaluate_and_trigger_alerts(user_id)

    latest_prices = price_repo.get_latest_points_map([int(r[2]) for r in rows])
    result = []
    for row in rows:
        current_price = latest_prices.get(int(row[2]), {}).get("price")
        result.append(
            AlertOut(
                id=int(row[0]),
                user_id=int(row[1]),
                asset_id=int(row[2]),
                symbol=row[3],
                condition=row[4],
                target_price=float(row[5]),
                current_price=current_price,
                is_active=bool(row[6]),
                triggered_at=row[7],
                created_at=row[8],
            )
        )
    return result


@router.post("/{user_id}/alerts/{alert_id}/reactivate", response_model=list[AlertOut])
def reactivate_alert(user_id: int, alert_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    row = db.conn.execute(
        "SELECT id FROM user_alerts WHERE id=? AND user_id=?",
        (alert_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")

    db.conn.execute(
        "UPDATE user_alerts SET is_active = 1, triggered_at = NULL WHERE id=? AND user_id=?",
        (alert_id, user_id),
    )
    db.conn.commit()
    return get_alerts(user_id)


@router.post("/{user_id}/alerts", response_model=list[AlertOut])
def create_alert(user_id: int, payload: AlertCreateRequest):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not price_repo.asset_exists(payload.asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    if payload.condition not in {"above", "below"}:
        raise HTTPException(status_code=400, detail="condition must be above or below")
    if payload.target_price <= 0:
        raise HTTPException(status_code=400, detail="target_price must be > 0")

    db.conn.execute(
        """
        INSERT INTO user_alerts (user_id, asset_id, condition, target_price)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, payload.asset_id, payload.condition, payload.target_price),
    )
    db.conn.commit()
    return get_alerts(user_id)


@router.delete("/{user_id}/alerts/{alert_id}", response_model=list[AlertOut])
def delete_alert(user_id: int, alert_id: int):
    user = user_repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.conn.execute("DELETE FROM user_alerts WHERE id=? AND user_id=?", (alert_id, user_id))
    db.conn.commit()
    return get_alerts(user_id)
