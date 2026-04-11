from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.storage.db import db
from app.storage.user_repository import UserRepository

router = APIRouter(prefix="/chat", tags=["chat"])

user_repo = UserRepository()


class ChatUserOut(BaseModel):
    id: int
    username: str


class ChatMessageOut(BaseModel):
    id: int
    sender_user_id: int
    receiver_user_id: int
    sender_username: str
    receiver_username: str
    message: str
    created_at: str


class ChatSendRequest(BaseModel):
    sender_user_id: int
    receiver_user_id: int
    message: str


class ChatConversationOut(BaseModel):
    user: ChatUserOut
    last_message: str
    last_message_sender_id: int
    last_message_at: str


def _ensure_user(user_id: int):
    row = user_repo.get_user(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row


@router.get("/users/search", response_model=list[ChatUserOut])
def search_chat_users(
    requester_id: int = Query(..., ge=1),
    q: str = Query(..., min_length=1, max_length=64),
    limit: int = Query(10, ge=1, le=50),
):
    _ensure_user(requester_id)
    rows = user_repo.search_users(query=q, exclude_user_id=requester_id, limit=limit)
    return [ChatUserOut(id=int(row[0]), username=row[1]) for row in rows]


@router.get("/conversations/{user_id}", response_model=list[ChatConversationOut])
def get_conversations(user_id: int, limit: int = Query(20, ge=1, le=100)):
    _ensure_user(user_id)

    rows = db.conn.execute(
        """
        WITH normalized AS (
            SELECT
                id,
                CASE WHEN sender_user_id = ? THEN receiver_user_id ELSE sender_user_id END AS other_user_id,
                sender_user_id,
                message,
                created_at
            FROM chat_messages
            WHERE sender_user_id = ? OR receiver_user_id = ?
        ), ranked AS (
            SELECT
                id,
                other_user_id,
                sender_user_id,
                message,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY other_user_id ORDER BY id DESC) AS rn
            FROM normalized
        )
        SELECT r.other_user_id, u.username, r.message, r.sender_user_id, r.created_at
        FROM ranked r
        JOIN users u ON u.id = r.other_user_id
        WHERE r.rn = 1
        ORDER BY r.id DESC
        LIMIT ?
        """,
        (user_id, user_id, user_id, limit),
    ).fetchall()

    return [
        ChatConversationOut(
            user=ChatUserOut(id=int(row[0]), username=row[1]),
            last_message=row[2],
            last_message_sender_id=int(row[3]),
            last_message_at=row[4],
        )
        for row in rows
    ]


@router.get("/messages", response_model=list[ChatMessageOut])
def get_messages(
    user_id: int = Query(..., ge=1),
    other_user_id: int = Query(..., ge=1),
    limit: int = Query(200, ge=1, le=500),
):
    _ensure_user(user_id)
    _ensure_user(other_user_id)

    rows = db.conn.execute(
        """
        SELECT
            m.id,
            m.sender_user_id,
            m.receiver_user_id,
            su.username,
            ru.username,
            m.message,
            m.created_at
        FROM chat_messages m
        JOIN users su ON su.id = m.sender_user_id
        JOIN users ru ON ru.id = m.receiver_user_id
        WHERE
            (m.sender_user_id = ? AND m.receiver_user_id = ?)
            OR
            (m.sender_user_id = ? AND m.receiver_user_id = ?)
        ORDER BY m.id DESC
        LIMIT ?
        """,
        (user_id, other_user_id, other_user_id, user_id, limit),
    ).fetchall()

    ordered = list(reversed(rows))
    return [
        ChatMessageOut(
            id=int(row[0]),
            sender_user_id=int(row[1]),
            receiver_user_id=int(row[2]),
            sender_username=row[3],
            receiver_username=row[4],
            message=row[5],
            created_at=row[6],
        )
        for row in ordered
    ]


@router.post("/messages", response_model=ChatMessageOut)
def send_message(payload: ChatSendRequest):
    _ensure_user(payload.sender_user_id)
    _ensure_user(payload.receiver_user_id)

    if payload.sender_user_id == payload.receiver_user_id:
        raise HTTPException(status_code=400, detail="Cannot send a message to yourself")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message is too long")

    cursor = db.conn.execute(
        """
        INSERT INTO chat_messages (sender_user_id, receiver_user_id, message)
        VALUES (?, ?, ?)
        """,
        (payload.sender_user_id, payload.receiver_user_id, message),
    )
    db.conn.commit()

    row = db.conn.execute(
        """
        SELECT
            m.id,
            m.sender_user_id,
            m.receiver_user_id,
            su.username,
            ru.username,
            m.message,
            m.created_at
        FROM chat_messages m
        JOIN users su ON su.id = m.sender_user_id
        JOIN users ru ON ru.id = m.receiver_user_id
        WHERE m.id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()

    return ChatMessageOut(
        id=int(row[0]),
        sender_user_id=int(row[1]),
        receiver_user_id=int(row[2]),
        sender_username=row[3],
        receiver_username=row[4],
        message=row[5],
        created_at=row[6],
    )
