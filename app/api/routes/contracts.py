from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.storage.db import db
from app.storage.user_repository import UserRepository
from app.services.contract_pdf import generate_contract_pdf
from app.config import ROOT_DIR

router = APIRouter(prefix="/contracts", tags=["contracts"])
user_repo = UserRepository()


class ContractCreateRequest(BaseModel):
    buyer_user_id: int
    seller_user_id: int
    asset_symbol: str
    quantity_kg: float
    purity_pct: float
    price_per_kg: float
    currency: str = "USD"
    delivery_terms: str = "CIF"
    origin_port: str | None = None
    destination_port: str | None = None


class ContractEventCreateRequest(BaseModel):
    actor_user_id: int
    event_type: str
    note: str | None = None
    status: str | None = None


class ContractOut(BaseModel):
    id: int
    buyer_user_id: int
    buyer_username: str
    seller_user_id: int
    seller_username: str
    asset_symbol: str
    quantity_kg: float
    purity_pct: float
    price_per_kg: float
    currency: str
    delivery_terms: str | None = None
    origin_port: str | None = None
    destination_port: str | None = None
    status: str
    agreed_at: str | None = None
    buyer_signed_at: str | None = None
    seller_signed_at: str | None = None
    created_at: str
    pdf_url: str | None = None


class ContractEventOut(BaseModel):
    id: int
    contract_id: int
    actor_user_id: int
    actor_username: str
    event_type: str
    note: str | None = None
    created_at: str


def _ensure_user(user_id: int):
    row = user_repo.get_user(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row


def _ensure_contract(contract_id: int):
    row = db.conn.execute(
        "SELECT id, buyer_user_id, seller_user_id, status FROM contracts WHERE id=?",
        (contract_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    return row


def _ensure_contract_participant(contract_id: int, actor_user_id: int):
    row = _ensure_contract(contract_id)
    buyer_user_id = int(row[1])
    seller_user_id = int(row[2])
    if actor_user_id not in {buyer_user_id, seller_user_id}:
        raise HTTPException(status_code=403, detail="Only contract participants can perform this action")
    return row


def _row_to_contract_out(row):
    contract_id = int(row[0])
    pdf_url = f"/contracts/{contract_id}/pdf" if _contract_pdf_path(contract_id).exists() else None
    return ContractOut(
        id=contract_id,
        buyer_user_id=int(row[1]),
        buyer_username=row[2],
        seller_user_id=int(row[3]),
        seller_username=row[4],
        asset_symbol=row[5],
        quantity_kg=float(row[6]),
        purity_pct=float(row[7]),
        price_per_kg=float(row[8]),
        currency=row[9],
        delivery_terms=row[10],
        origin_port=row[11],
        destination_port=row[12],
        status=row[13],
        agreed_at=row[14],
        buyer_signed_at=row[15],
        seller_signed_at=row[16],
        created_at=row[17],
        pdf_url=pdf_url,
    )


def _contract_pdf_path(contract_id: int) -> Path:
    return ROOT_DIR / "storage" / "contracts_docs" / f"contract_{contract_id}.pdf"


def _generate_contract_pdf_from_row(row):
    contract_id = int(row[0])
    payload = {
        "id": contract_id,
        "buyer_user_id": int(row[1]),
        "buyer_username": row[2],
        "seller_user_id": int(row[3]),
        "seller_username": row[4],
        "asset_symbol": row[5],
        "quantity_kg": float(row[6]),
        "purity_pct": float(row[7]),
        "price_per_kg": float(row[8]),
        "currency": row[9],
        "delivery_terms": row[10],
        "origin_port": row[11],
        "destination_port": row[12],
        "status": row[13],
        "agreed_at": row[14],
        "buyer_signed_at": row[15],
        "seller_signed_at": row[16],
        "created_at": row[17],
    }
    pdf_path = _contract_pdf_path(contract_id)
    generate_contract_pdf(pdf_path, payload)
    return pdf_path


@router.get("/", response_model=list[ContractOut])
def list_contracts(
    user_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    q: str | None = Query(None, min_length=1, max_length=100),
    status: str | None = Query(None, min_length=1, max_length=50),
):
    _ensure_user(user_id)

    search_term = q.strip().upper() if q else None
    status_filter = status.strip().lower() if status else None

    where_clauses = ["(c.buyer_user_id = ? OR c.seller_user_id = ?)"]
    params: list[object] = [user_id, user_id]

    if search_term:
        where_clauses.append(
            """
            (
                upper(c.asset_symbol) LIKE ?
                OR upper(ub.username) LIKE ?
                OR upper(us.username) LIKE ?
                OR upper(COALESCE(c.origin_port, '')) LIKE ?
                OR upper(COALESCE(c.destination_port, '')) LIKE ?
                OR CAST(c.id AS TEXT) LIKE ?
            )
            """
        )
        like_value = f"%{search_term}%"
        params.extend([like_value, like_value, like_value, like_value, like_value, like_value])

    if status_filter:
        where_clauses.append("lower(c.status) = ?")
        params.append(status_filter)

    where_sql = " AND ".join(where_clauses)
    params.append(limit)

    rows = db.conn.execute(
        f"""
        SELECT
            c.id,
            c.buyer_user_id,
            ub.username,
            c.seller_user_id,
            us.username,
            c.asset_symbol,
            c.quantity_kg,
            c.purity_pct,
            c.price_per_kg,
            c.currency,
            c.delivery_terms,
            c.origin_port,
            c.destination_port,
            c.status,
            c.agreed_at,
            c.buyer_signed_at,
            c.seller_signed_at,
            c.created_at
        FROM contracts c
        JOIN users ub ON ub.id = c.buyer_user_id
        JOIN users us ON us.id = c.seller_user_id
        WHERE {where_sql}
        ORDER BY c.id DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
    return [_row_to_contract_out(row) for row in rows]


@router.post("/", response_model=ContractOut)
def create_contract(payload: ContractCreateRequest):
    _ensure_user(payload.buyer_user_id)
    _ensure_user(payload.seller_user_id)
    if payload.buyer_user_id == payload.seller_user_id:
        raise HTTPException(status_code=400, detail="Buyer and seller must be different users")
    if payload.quantity_kg <= 0:
        raise HTTPException(status_code=400, detail="quantity_kg must be > 0")
    if payload.purity_pct <= 0 or payload.purity_pct > 100:
        raise HTTPException(status_code=400, detail="purity_pct must be between 0 and 100")
    if payload.price_per_kg <= 0:
        raise HTTPException(status_code=400, detail="price_per_kg must be > 0")

    symbol = payload.asset_symbol.strip().upper()
    asset_row = db.conn.execute("SELECT symbol FROM assets WHERE upper(symbol)=?", (symbol,)).fetchone()
    if not asset_row:
        raise HTTPException(status_code=404, detail="Asset symbol not found")

    cursor = db.conn.execute(
        """
        INSERT INTO contracts (
            buyer_user_id,
            seller_user_id,
            asset_symbol,
            quantity_kg,
            purity_pct,
            price_per_kg,
            currency,
            delivery_terms,
            origin_port,
            destination_port,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        """,
        (
            payload.buyer_user_id,
            payload.seller_user_id,
            symbol,
            payload.quantity_kg,
            payload.purity_pct,
            payload.price_per_kg,
            payload.currency.strip().upper() or "USD",
            payload.delivery_terms,
            payload.origin_port,
            payload.destination_port,
        ),
    )

    db.conn.execute(
        """
        INSERT INTO contract_events (contract_id, actor_user_id, event_type, note)
        VALUES (?, ?, 'created', 'Contract created in ELEMENTAL Contract Suite')
        """,
        (cursor.lastrowid, payload.buyer_user_id),
    )
    db.conn.commit()

    row = db.conn.execute(
        """
        SELECT
            c.id,
            c.buyer_user_id,
            ub.username,
            c.seller_user_id,
            us.username,
            c.asset_symbol,
            c.quantity_kg,
            c.purity_pct,
            c.price_per_kg,
            c.currency,
            c.delivery_terms,
            c.origin_port,
            c.destination_port,
            c.status,
            c.agreed_at,
            c.buyer_signed_at,
            c.seller_signed_at,
            c.created_at
        FROM contracts c
        JOIN users ub ON ub.id = c.buyer_user_id
        JOIN users us ON us.id = c.seller_user_id
        WHERE c.id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()

    try:
        _generate_contract_pdf_from_row(row)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Contract created but PDF generation failed: {exc}") from exc

    return _row_to_contract_out(row)


@router.get("/{contract_id}/pdf")
def download_contract_pdf(contract_id: int):
    _ensure_contract(contract_id)
    pdf_path = _contract_pdf_path(contract_id)

    if not pdf_path.exists():
        row = db.conn.execute(
            """
            SELECT
                c.id,
                c.buyer_user_id,
                ub.username,
                c.seller_user_id,
                us.username,
                c.asset_symbol,
                c.quantity_kg,
                c.purity_pct,
                c.price_per_kg,
                c.currency,
                c.delivery_terms,
                c.origin_port,
                c.destination_port,
                c.status,
                c.agreed_at,
                c.buyer_signed_at,
                c.seller_signed_at,
                c.created_at
            FROM contracts c
            JOIN users ub ON ub.id = c.buyer_user_id
            JOIN users us ON us.id = c.seller_user_id
            WHERE c.id = ?
            """,
            (contract_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Contract not found")

        try:
            _generate_contract_pdf_from_row(row)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to generate contract PDF: {exc}") from exc

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"contract_{contract_id}.pdf",
    )


@router.get("/{contract_id}/events", response_model=list[ContractEventOut])
def list_contract_events(contract_id: int):
    _ensure_contract(contract_id)
    rows = db.conn.execute(
        """
        SELECT e.id, e.contract_id, e.actor_user_id, u.username, e.event_type, e.note, e.created_at
        FROM contract_events e
        JOIN users u ON u.id = e.actor_user_id
        WHERE e.contract_id = ?
        ORDER BY e.id ASC
        """,
        (contract_id,),
    ).fetchall()
    return [
        ContractEventOut(
            id=int(row[0]),
            contract_id=int(row[1]),
            actor_user_id=int(row[2]),
            actor_username=row[3],
            event_type=row[4],
            note=row[5],
            created_at=row[6],
        )
        for row in rows
    ]


@router.post("/{contract_id}/events", response_model=list[ContractEventOut])
def add_contract_event(contract_id: int, payload: ContractEventCreateRequest):
    _ensure_user(payload.actor_user_id)
    contract_row = _ensure_contract_participant(contract_id, payload.actor_user_id)

    event_type = payload.event_type.strip().lower()
    if not event_type:
        raise HTTPException(status_code=400, detail="event_type is required")

    current_status = str(contract_row[3]).lower()
    if current_status in {"delivered", "cancelled"} and event_type not in {"note", "audit"}:
        raise HTTPException(status_code=400, detail="Contract is finalized and cannot be modified")

    buyer_user_id = int(contract_row[1])
    sign_event_types = {"sign", "counter_signed", "buyer_signed", "seller_signed"}

    if event_type in sign_event_types:
        normalized_event_type = "buyer_signed" if payload.actor_user_id == buyer_user_id else "seller_signed"
        db.conn.execute(
            """
            INSERT INTO contract_events (contract_id, actor_user_id, event_type, note)
            VALUES (?, ?, ?, ?)
            """,
            (contract_id, payload.actor_user_id, normalized_event_type, payload.note or "Digital signature captured"),
        )

        if payload.actor_user_id == buyer_user_id:
            db.conn.execute(
                """
                UPDATE contracts
                SET buyer_signed_at = COALESCE(buyer_signed_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                (contract_id,),
            )
        else:
            db.conn.execute(
                """
                UPDATE contracts
                SET seller_signed_at = COALESCE(seller_signed_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                (contract_id,),
            )

        signature_row = db.conn.execute(
            "SELECT buyer_signed_at, seller_signed_at FROM contracts WHERE id = ?",
            (contract_id,),
        ).fetchone()
        buyer_signed_at = signature_row[0] if signature_row else None
        seller_signed_at = signature_row[1] if signature_row else None

        if buyer_signed_at and seller_signed_at:
            db.conn.execute(
                """
                UPDATE contracts
                SET status = 'signed',
                    agreed_at = COALESCE(agreed_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                (contract_id,),
            )
        elif current_status == "draft":
            db.conn.execute(
                "UPDATE contracts SET status = 'in_review' WHERE id = ?",
                (contract_id,),
            )

    else:
        db.conn.execute(
            """
            INSERT INTO contract_events (contract_id, actor_user_id, event_type, note)
            VALUES (?, ?, ?, ?)
            """,
            (contract_id, payload.actor_user_id, event_type, payload.note),
        )

    if payload.status and event_type not in sign_event_types:
        status = payload.status.strip().lower()
        if status:
            agreed_at_value = "CURRENT_TIMESTAMP" if status in {"signed", "active"} else "NULL"
            db.conn.execute(
                f"UPDATE contracts SET status = ?, agreed_at = {agreed_at_value} WHERE id = ?",
                (status, contract_id),
            )

    db.conn.commit()

    try:
        row = db.conn.execute(
            """
            SELECT
                c.id,
                c.buyer_user_id,
                ub.username,
                c.seller_user_id,
                us.username,
                c.asset_symbol,
                c.quantity_kg,
                c.purity_pct,
                c.price_per_kg,
                c.currency,
                c.delivery_terms,
                c.origin_port,
                c.destination_port,
                c.status,
                c.agreed_at,
                c.buyer_signed_at,
                c.seller_signed_at,
                c.created_at
            FROM contracts c
            JOIN users ub ON ub.id = c.buyer_user_id
            JOIN users us ON us.id = c.seller_user_id
            WHERE c.id = ?
            """,
            (contract_id,),
        ).fetchone()
        if row:
            _generate_contract_pdf_from_row(row)
    except (OSError, ValueError):
        pass

    return list_contract_events(contract_id)
