"""Server-Sent Events hub: one poller watches DynamoDB and fans changes out to every client.

Events have the same payloads the frontend already understands:
  * a JSON array with every node (graph snapshot)
  * {"__type": "track", "track": {...}} when a track is selected
"""
import asyncio
import json
import logging
from typing import Any

from app.interfaces.repositories import NodeRepository

log = logging.getLogger(__name__)


class LiveFeed:
    def __init__(self, nodes: NodeRepository, poll_seconds: float = 1.0):
        self._nodes = nodes
        self._poll_seconds = poll_seconds
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._last_snapshot: str | None = None
        self._current_track: dict[str, Any] | None = None
        self._task: asyncio.Task | None = None

    # --- lifecycle --------------------------------------------------------------------------
    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self.refresh()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Error polling DynamoDB")
            await asyncio.sleep(self._poll_seconds)

    async def refresh(self) -> None:
        """Re-read the nodes and broadcast if anything changed."""
        snapshot = json.dumps(await asyncio.to_thread(self._nodes.list_all))
        if snapshot != self._last_snapshot:
            self._last_snapshot = snapshot
            self._publish(snapshot)

    # --- subscribers ------------------------------------------------------------------------
    async def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        if self._last_snapshot is None:
            await self.refresh()
        if self._last_snapshot is not None:
            queue.put_nowait(self._last_snapshot)
        if self._current_track:
            queue.put_nowait(self._track_event(self._current_track))
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    def _publish(self, payload: str) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:  # slow client: drop it, EventSource will reconnect
                self._subscribers.discard(queue)

    # --- current track ----------------------------------------------------------------------
    @property
    def current_track(self) -> dict[str, Any] | None:
        return self._current_track

    def publish_track(self, track: dict[str, Any]) -> None:
        self._current_track = track
        self._publish(self._track_event(track))

    @staticmethod
    def _track_event(track: dict[str, Any]) -> str:
        return json.dumps({"__type": "track", "track": track})
