import asyncio
import json
from typing import Any


class SubscriptionRequestStream:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    async def publish_subscription_ready(
        self, *, subscription_id: int, tenant_id: int
    ) -> None:
        payload = {
            "subscription_id": subscription_id,
            "tenant_id": tenant_id,
        }
        async with self._lock:
            subscribers = list(self._subscribers)

        for queue in subscribers:
            await queue.put(payload)


subscription_request_stream = SubscriptionRequestStream()


def format_sse_message(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"