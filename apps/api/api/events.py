import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import redis.asyncio as redis
from fastapi import WebSocket

from api.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EventBus:
    def __init__(self) -> None:
        self._redis: redis.Redis | None = None
        self._local_subscribers: dict[str, set[WebSocket]] = {}

    async def connect(self) -> None:
        try:
            self._redis = redis.from_url(settings.redis_url, decode_responses=True)
            await self._redis.ping()
        except Exception:
            logger.warning("Redis unavailable, using in-memory event bus only")
            self._redis = None

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    def _channel(self, task_id: str) -> str:
        return f"purrscription:task:{task_id}"

    async def publish(
        self,
        *,
        event_type: str,
        task_id: str,
        user_id: str,
        data: dict[str, Any],
        version: int | None = None,
    ) -> str:
        event_id = str(uuid4())
        envelope = {
            "type": event_type,
            "timestamp": datetime.now(UTC).isoformat(),
            "taskId": task_id,
            "userId": user_id,
            "data": data,
            "eventId": event_id,
            "version": version,
        }
        payload = json.dumps(envelope)
        if self._redis:
            await self._redis.publish(self._channel(task_id), payload)
        await self._broadcast_local(task_id, payload)
        return event_id

    async def _broadcast_local(self, task_id: str, payload: str) -> None:
        sockets = list(self._local_subscribers.get(task_id, set()))
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._local_subscribers.get(task_id, set()).discard(ws)

    def subscribe_local(self, task_id: str, websocket: WebSocket) -> None:
        self._local_subscribers.setdefault(task_id, set()).add(websocket)

    def unsubscribe_local(self, task_id: str, websocket: WebSocket) -> None:
        self._local_subscribers.get(task_id, set()).discard(websocket)


event_bus = EventBus()
