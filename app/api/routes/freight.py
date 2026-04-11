from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.storage.db import db

router = APIRouter(prefix="/freight", tags=["freight"])


class PortOut(BaseModel):
    code: str
    name: str
    country: str
    max_draft_m: float
    max_beam_m: float
    max_loa_m: float
    crane_capacity_tons: float
    latitude: float | None = None
    longitude: float | None = None


class FreightRateOut(BaseModel):
    origin_port: str
    destination_port: str
    usd_per_ton: float
    updated_at: str


class VesselOut(BaseModel):
    id: int
    name: str
    imo: str | None = None
    vessel_class: str
    draft_m: float
    beam_m: float
    loa_m: float
    max_cargo_tons: float
    operator_name: str | None = None
    status: str
    eligible_for_route: bool
    eligibility_reason: str


def _get_port(code: str):
    row = db.conn.execute(
        "SELECT code, name, country, max_draft_m, max_beam_m, max_loa_m, crane_capacity_tons, latitude, longitude FROM ports WHERE code=?",
        (code,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Port '{code}' not found")
    return row


@router.get("/ports", response_model=list[PortOut])
def list_ports():
    rows = db.conn.execute(
        "SELECT code, name, country, max_draft_m, max_beam_m, max_loa_m, crane_capacity_tons, latitude, longitude FROM ports ORDER BY name ASC"
    ).fetchall()
    return [
        PortOut(
            code=row[0],
            name=row[1],
            country=row[2],
            max_draft_m=float(row[3]),
            max_beam_m=float(row[4]),
            max_loa_m=float(row[5]),
            crane_capacity_tons=float(row[6]),
            latitude=float(row[7]) if row[7] is not None else None,
            longitude=float(row[8]) if row[8] is not None else None,
        )
        for row in rows
    ]


@router.get("/rates", response_model=list[FreightRateOut])
def list_freight_rates(origin_port: str | None = None, destination_port: str | None = None):
    where = []
    params: list[str] = []
    if origin_port:
        where.append("origin_port = ?")
        params.append(origin_port)
    if destination_port:
        where.append("destination_port = ?")
        params.append(destination_port)

    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = db.conn.execute(
        f"""
        SELECT origin_port, destination_port, usd_per_ton, updated_at
        FROM freight_rates
        {where_clause}
        ORDER BY updated_at DESC
        """,
        tuple(params),
    ).fetchall()
    return [
        FreightRateOut(
            origin_port=row[0],
            destination_port=row[1],
            usd_per_ton=float(row[2]),
            updated_at=row[3],
        )
        for row in rows
    ]


@router.get("/vessels/eligible", response_model=list[VesselOut])
def list_eligible_vessels(
    origin_port: str = Query(...),
    destination_port: str = Query(...),
    cargo_tons: float = Query(..., gt=0),
):
    origin = _get_port(origin_port)
    destination = _get_port(destination_port)

    route_max_draft = min(float(origin[3]), float(destination[3]))
    route_max_beam = min(float(origin[4]), float(destination[4]))
    route_max_loa = min(float(origin[5]), float(destination[5]))

    rows = db.conn.execute(
        """
        SELECT id, name, imo, vessel_class, draft_m, beam_m, loa_m, max_cargo_tons, operator_name, status
        FROM vessels
        WHERE status = 'available'
        ORDER BY max_cargo_tons ASC
        """
    ).fetchall()

    result: list[VesselOut] = []
    for row in rows:
        vessel_draft = float(row[4])
        vessel_beam = float(row[5])
        vessel_loa = float(row[6])
        capacity = float(row[7])

        reasons = []
        if vessel_draft > route_max_draft:
            reasons.append("Draft exceeds route limit")
        if vessel_beam > route_max_beam:
            reasons.append("Beam exceeds route limit")
        if vessel_loa > route_max_loa:
            reasons.append("LOA exceeds route limit")
        if capacity < cargo_tons:
            reasons.append("Insufficient cargo capacity")

        eligible = not reasons
        result.append(
            VesselOut(
                id=int(row[0]),
                name=row[1],
                imo=row[2],
                vessel_class=row[3],
                draft_m=vessel_draft,
                beam_m=vessel_beam,
                loa_m=vessel_loa,
                max_cargo_tons=capacity,
                operator_name=row[8],
                status=row[9],
                eligible_for_route=eligible,
                eligibility_reason="Eligible" if eligible else "; ".join(reasons),
            )
        )

    return result
