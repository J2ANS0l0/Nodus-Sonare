import asyncio
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import ContainerDep
from app.api.schemas import NodeSelectedRequest

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["nodes"])

KEEPALIVE_SECONDS = 15


@router.get("/nodes/stream")
async def stream_nodes(request: Request, container: ContainerDep) -> StreamingResponse:
    """Server-Sent Events: the full node list whenever it changes, plus selected-track events."""
    feed = container.feed
    queue = await feed.subscribe()

    async def events() -> AsyncIterator[str]:
        try:
            while not await request.is_disconnected():
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_SECONDS)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            feed.unsubscribe(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/node_selected")
def node_selected(body: NodeSelectedRequest, container: ContainerDep) -> Response:
    log.info("Node selected: %s (ID: %s)", body.name, body.id)
    if isinstance(body.content, dict) and body.content.get("music_id"):
        container.feed.publish_track(body.content)
    return Response(status_code=status.HTTP_200_OK)
