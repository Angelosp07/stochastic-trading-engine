from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.storage.db import db
from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/shipments", tags=["shipments"])
user_repo = UserRepository()


class ShipmentCreateFromContractRequest(BaseModel):
    created_by_user_id: int
    vessel_id: int | None = None
    broker_name: str | None = None


class ShipmentStatusUpdateRequest(BaseModel):
    actor_user_id: int
    status: str
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    eta: str | None = None


class ShipmentOut(BaseModel):
    id: int
    contract_id: int
    asset_symbol: str
    quantity_kg: float
    status: str
    origin_port: str | None = None
    destination_port: str | None = None
    vessel_id: int | None = None
    vessel_name: str | None = None
    broker_name: str | None = None
    eta: str | None = None
    current_lat: float | None = None
    current_lon: float | None = None
    last_position_at: str | None = None
    created_at: str


class ShipmentEventOut(BaseModel):
    id: int
    shipment_id: int
    event_type: str
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    eta: str | None = None
    created_at: str


def _ensure_user(user_id: int):
    row = user_repo.get_user(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")


def _ensure_contract(contract_id: int):
    row = db.conn.execute(
        """
        SELECT id, asset_symbol, quantity_kg, origin_port, destination_port, buyer_user_id, seller_user_id, status
        FROM contracts
        WHERE id=?
        """,
        (contract_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    return row


def _ensure_contract_participant(contract_row, actor_user_id: int):
    buyer_user_id = int(contract_row[5])
    seller_user_id = int(contract_row[6])
    if actor_user_id not in {buyer_user_id, seller_user_id}:
        raise HTTPException(status_code=403, detail="Only contract participants can perform shipment actions")


def _ensure_shipment(shipment_id: int):
    row = db.conn.execute("SELECT id FROM shipments WHERE id=?", (shipment_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Shipment not found")


def _list_shipments_by_user(
    user_id: int,
    limit: int,
    q: str | None = None,
    status: str | None = None,
):
    search_term = q.strip().upper() if q else None
    status_filter = status.strip().lower() if status else None

    where_clauses = ["(c.buyer_user_id = ? OR c.seller_user_id = ?)"]
    params: list[object] = [user_id, user_id]

    if search_term:
        where_clauses.append(
            """
            (
                upper(c.asset_symbol) LIKE ?
                OR upper(COALESCE(s.origin_port, '')) LIKE ?
                OR upper(COALESCE(s.destination_port, '')) LIKE ?
                OR upper(COALESCE(v.name, '')) LIKE ?
                OR upper(COALESCE(s.broker_name, '')) LIKE ?
                OR CAST(s.id AS TEXT) LIKE ?
                OR CAST(s.contract_id AS TEXT) LIKE ?
            )
            """
        )
        like_value = f"%{search_term}%"
        params.extend([like_value, like_value, like_value, like_value, like_value, like_value, like_value])

    if status_filter:
        where_clauses.append("lower(s.status) = ?")
        params.append(status_filter)

    where_sql = " AND ".join(where_clauses)
    params.append(limit)

    rows = db.conn.execute(
        f"""
        SELECT
            s.id,
            s.contract_id,
            c.asset_symbol,
            c.quantity_kg,
            s.status,
            s.origin_port,
            s.destination_port,
            s.vessel_id,
            v.name,
            s.broker_name,
            s.eta,
            s.current_lat,
            s.current_lon,
            s.last_position_at,
            s.created_at
        FROM shipments s
        JOIN contracts c ON c.id = s.contract_id
        LEFT JOIN vessels v ON v.id = s.vessel_id
        WHERE {where_sql}
        ORDER BY s.id DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
    return [
        ShipmentOut(
            id=int(row[0]),
            contract_id=int(row[1]),
            asset_symbol=row[2],
            quantity_kg=float(row[3]),
            status=row[4],
            origin_port=row[5],
            destination_port=row[6],
            vessel_id=int(row[7]) if row[7] is not None else None,
            vessel_name=row[8],
            broker_name=row[9],
            eta=row[10],
            current_lat=float(row[11]) if row[11] is not None else None,
            current_lon=float(row[12]) if row[12] is not None else None,
            last_position_at=row[13],
            created_at=row[14],
        )
        for row in rows
    ]


@router.get("/", response_model=list[ShipmentOut])
def list_shipments(
    user_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    q: str | None = Query(None, min_length=1, max_length=100),
    status: str | None = Query(None, min_length=1, max_length=50),
):
    _ensure_user(user_id)
    return _list_shipments_by_user(user_id, limit, q=q, status=status)


@router.post("/from-contract/{contract_id}", response_model=ShipmentOut)
def create_shipment_from_contract(contract_id: int, payload: ShipmentCreateFromContractRequest):
    _ensure_user(payload.created_by_user_id)
    contract_row = _ensure_contract(contract_id)
    _ensure_contract_participant(contract_row, payload.created_by_user_id)

    contract_status = str(contract_row[7]).lower()
    if contract_status not in {"signed", "active"}:
        raise HTTPException(status_code=400, detail="Shipment can only be created for signed/active contracts")

    existing = db.conn.execute(
        "SELECT id FROM shipments WHERE contract_id = ? ORDER BY id DESC LIMIT 1",
        (contract_id,),
    ).fetchone()
    if existing:
        shipment_id = int(existing[0])
    else:
        cursor = db.conn.execute(
            """
            INSERT INTO shipments (contract_id, vessel_id, broker_name, origin_port, destination_port, status)
            VALUES (?, ?, ?, ?, ?, 'planned')
            """,
            (
                contract_id,
                payload.vessel_id,
                payload.broker_name,
                contract_row[3],
                contract_row[4],
            ),
        )
        shipment_id = int(cursor.lastrowid)
        db.conn.execute(
            """
            INSERT INTO shipment_events (shipment_id, event_type, description)
            VALUES (?, 'planned', 'Shipment record created from signed contract')
            """,
            (shipment_id,),
        )
        db.conn.commit()

    row = db.conn.execute(
        """
        SELECT
            s.id,
            s.contract_id,
            c.asset_symbol,
            c.quantity_kg,
            s.status,
            s.origin_port,
            s.destination_port,
            s.vessel_id,
            v.name,
            s.broker_name,
            s.eta,
            s.current_lat,
            s.current_lon,
            s.last_position_at,
            s.created_at
        FROM shipments s
        JOIN contracts c ON c.id = s.contract_id
        LEFT JOIN vessels v ON v.id = s.vessel_id
        WHERE s.id = ?
        """,
        (shipment_id,),
    ).fetchone()

    return ShipmentOut(
        id=int(row[0]),
        contract_id=int(row[1]),
        asset_symbol=row[2],
        quantity_kg=float(row[3]),
        status=row[4],
        origin_port=row[5],
        destination_port=row[6],
        vessel_id=int(row[7]) if row[7] is not None else None,
        vessel_name=row[8],
        broker_name=row[9],
        eta=row[10],
        current_lat=float(row[11]) if row[11] is not None else None,
        current_lon=float(row[12]) if row[12] is not None else None,
        last_position_at=row[13],
        created_at=row[14],
    )


@router.get("/{shipment_id}/events", response_model=list[ShipmentEventOut])
def list_shipment_events(shipment_id: int):
    _ensure_shipment(shipment_id)
    rows = db.conn.execute(
        """
        SELECT id, shipment_id, event_type, description, latitude, longitude, eta, created_at
        FROM shipment_events
        WHERE shipment_id = ?
        ORDER BY id ASC
        """,
        (shipment_id,),
    ).fetchall()
    return [
        ShipmentEventOut(
            id=int(row[0]),
            shipment_id=int(row[1]),
            event_type=row[2],
            description=row[3],
            latitude=float(row[4]) if row[4] is not None else None,
            longitude=float(row[5]) if row[5] is not None else None,
            eta=row[6],
            created_at=row[7],
        )
        for row in rows
    ]


@router.post("/{shipment_id}/status", response_model=list[ShipmentEventOut])
def update_shipment_status(shipment_id: int, payload: ShipmentStatusUpdateRequest):
    _ensure_shipment(shipment_id)
    _ensure_user(payload.actor_user_id)

    contract_row = db.conn.execute(
        """
        SELECT c.id, c.asset_symbol, c.quantity_kg, c.origin_port, c.destination_port, c.buyer_user_id, c.seller_user_id, c.status
        FROM shipments s
        JOIN contracts c ON c.id = s.contract_id
        WHERE s.id = ?
        """,
        (shipment_id,),
    ).fetchone()
    if not contract_row:
        raise HTTPException(status_code=404, detail="Contract not found for shipment")
    _ensure_contract_participant(contract_row, payload.actor_user_id)

    status = payload.status.strip().lower()
    if not status:
        raise HTTPException(status_code=400, detail="status is required")

    db.conn.execute(
        """
        UPDATE shipments
        SET status = ?,
            eta = COALESCE(?, eta),
            current_lat = COALESCE(?, current_lat),
            current_lon = COALESCE(?, current_lon),
            last_position_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status, payload.eta, payload.latitude, payload.longitude, shipment_id),
    )
    db.conn.execute(
        """
        INSERT INTO shipment_events (shipment_id, event_type, description, latitude, longitude, eta)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            shipment_id,
            status,
            payload.description,
            payload.latitude,
            payload.longitude,
            payload.eta,
        ),
    )
    db.conn.commit()
    return list_shipment_events(shipment_id)
