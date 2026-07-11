import json
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from api.auth import decode_token
from api.database import async_session_factory
from api.events import event_bus
from api.models import PresenceSession, Task, User

router = APIRouter(tags=["websocket"])


async def _authenticate_ws(websocket: WebSocket) -> User | None:
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        async with async_session_factory() as db:
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            return user
    except Exception:
        return None


@router.websocket("/ws")
async def websocket_main(websocket: WebSocket) -> None:
    await websocket.accept()
    user = await _authenticate_ws(websocket)
    if user is None:
        await websocket.close(code=4401)
        return

    subscribed_tasks: set[str] = set()
    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            action = message.get("action")
            task_id = message.get("taskId")
            if action == "subscribe" and task_id:
                subscribed_tasks.add(task_id)
                event_bus.subscribe_local(task_id, websocket)
                await _upsert_presence(user.id, task_id)
                await event_bus.publish(
                    event_type="user_joined",
                    task_id=task_id,
                    user_id=user.id,
                    data={"userId": user.id, "userName": user.name, "role": user.role},
                )
            elif action == "unsubscribe" and task_id:
                subscribed_tasks.discard(task_id)
                event_bus.unsubscribe_local(task_id, websocket)
                await _remove_presence(user.id, task_id)
                await event_bus.publish(
                    event_type="user_left",
                    task_id=task_id,
                    user_id=user.id,
                    data={"userId": user.id},
                )
            elif action == "heartbeat" and task_id:
                await _upsert_presence(user.id, task_id)
    except WebSocketDisconnect:
        pass
    finally:
        for task_id in subscribed_tasks:
            event_bus.unsubscribe_local(task_id, websocket)
            await _remove_presence(user.id, task_id)
            await event_bus.publish(
                event_type="user_left",
                task_id=task_id,
                user_id=user.id,
                data={"userId": user.id},
            )


@router.websocket("/ws/tasks/{task_id}")
async def websocket_task_room(websocket: WebSocket, task_id: str) -> None:
    await websocket.accept()
    user = await _authenticate_ws(websocket)
    if user is None:
        await websocket.close(code=4401)
        return

    async with async_session_factory() as db:
        task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
        if task is None:
            await websocket.close(code=4404)
            return

    event_bus.subscribe_local(task_id, websocket)
    await _upsert_presence(user.id, task_id)
    await websocket.send_json(
        {
            "type": "presence_updated",
            "taskId": task_id,
            "userId": user.id,
            "data": {"presence": await _presence_snapshot(task_id)},
        }
    )
    await event_bus.publish(
        event_type="user_joined",
        task_id=task_id,
        user_id=user.id,
        data={
            "userId": user.id,
            "userName": user.name,
            "role": user.role,
            "avatarUrl": user.avatar_url,
        },
    )
    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            if message.get("action") == "heartbeat":
                await _upsert_presence(user.id, task_id)
            elif message.get("action") == "focus":
                segment_id = message.get("segmentId")
                await _upsert_presence(user.id, task_id, segment_id)
                await event_bus.publish(
                    event_type="segment_focused",
                    task_id=task_id,
                    user_id=user.id,
                    data={
                        "userId": user.id,
                        "userName": user.name,
                        "role": user.role,
                        "segmentId": segment_id,
                        "avatarUrl": user.avatar_url,
                    },
                )
    except WebSocketDisconnect:
        pass
    finally:
        event_bus.unsubscribe_local(task_id, websocket)
        await _remove_presence(user.id, task_id)
        await event_bus.publish(
            event_type="user_left",
            task_id=task_id,
            user_id=user.id,
            data={"userId": user.id},
        )


async def _upsert_presence(user_id: str, task_id: str, segment_id: str | None = None) -> None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(PresenceSession).where(
                PresenceSession.user_id == user_id,
                PresenceSession.task_id == task_id,
            )
        )
        presence = result.scalar_one_or_none()
        if presence:
            presence.last_seen_at = datetime.now(UTC)
            presence.status = "active"
            if segment_id is not None:
                presence.focused_segment_id = segment_id
        else:
            db.add(
                PresenceSession(
                    user_id=user_id, task_id=task_id, status="active", focused_segment_id=segment_id
                )
            )
        await db.commit()


async def _remove_presence(user_id: str, task_id: str) -> None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(PresenceSession).where(
                PresenceSession.user_id == user_id,
                PresenceSession.task_id == task_id,
            )
        )
        presence = result.scalar_one_or_none()
        if presence:
            await db.delete(presence)
            await db.commit()


async def _presence_snapshot(task_id: str) -> list[dict[str, str | None]]:
    async with async_session_factory() as db:
        rows = (
            await db.execute(
                select(PresenceSession, User)
                .join(User, User.id == PresenceSession.user_id)
                .where(PresenceSession.task_id == task_id)
            )
        ).all()
        return [
            {
                "userId": member.id,
                "userName": member.name,
                "role": member.role,
                "avatarUrl": member.avatar_url,
                "segmentId": presence.focused_segment_id,
            }
            for presence, member in rows
        ]
