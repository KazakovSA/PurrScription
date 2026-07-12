import asyncio
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


CHANNEL_PREFIX = "purrscription:task:"


class EventBus:
    def __init__(self) -> None:
        self._redis: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None
        self._listener_task: asyncio.Task[None] | None = None
        self._local_subscribers: dict[str, set[WebSocket]] = {}

    async def connect(self) -> None:
        client: redis.Redis | None = None
        try:
            client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
                retry_on_timeout=False,
            )
            await asyncio.wait_for(client.ping(), timeout=2.0)
            self._redis = client
        except Exception:
            if client is not None:
                await client.aclose()
            logger.warning("Redis unavailable, using in-memory event bus only")
            self._redis = None
            return
        # With multiple workers each process must receive events published by any
        # other process, so subscribe to the shared channel and fan out to the
        # WebSocket clients connected to *this* worker.
        try:
            self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
            await self._pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
            self._listener_task = asyncio.create_task(self._listen())
        except Exception:
            logger.exception("Failed to start Redis event listener; using local only")
            self._pubsub = None
            self._listener_task = None

    async def _listen(self) -> None:
        assert self._pubsub is not None
        try:
            async for message in self._pubsub.listen():
                if not message or message.get("type") != "pmessage":
                    continue
                channel = message.get("channel") or ""
                payload = message.get("data")
                if not payload or not channel.startswith(CHANNEL_PREFIX):
                    continue
                task_id = channel[len(CHANNEL_PREFIX):]
                await self._broadcast_local(task_id, payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Redis event listener stopped unexpectedly")

    async def close(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._pubsub:
            try:
                await self._pubsub.aclose()
            except Exception:
                pass
        if self._redis:
            await self._redis.aclose()

    def _channel(self, task_id: str) -> str:
        return f"{CHANNEL_PREFIX}{task_id}"

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
        if self._redis and self._listener_task:
            # The pub/sub listener (in every worker, including this one) delivers the
            # payload to local WebSocket clients, so avoid a duplicate local broadcast.
            await self._redis.publish(self._channel(task_id), payload)
        else:
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
