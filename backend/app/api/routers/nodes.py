import asyncio
import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import ContainerDep
from app.api.schemas import NodeSelectedRequest

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["nodes"])

KEEPALIVE_SECONDS = 15


@router.get("/nodes")
def list_nodes(container: ContainerDep) -> list[dict[str, Any]]:
    return container.node_service.list_nodes()


@router.get("/nodes/stream")
async def stream_nodes(request: Request, container: ContainerDep) -> StreamingResponse:
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


@router.get("/nodes/{node_id}")
def get_node(node_id: str, container: ContainerDep) -> dict[str, Any]:
    return container.node_service.get_node(node_id)


@router.get("/current_track", response_model=None)
def current_track(container: ContainerDep) -> Any:
    track = container.feed.current_track
    return track if track else Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/node_selected")
def node_selected(body: NodeSelectedRequest, container: ContainerDep) -> Response:
    log.info("Node selected: %s (ID: %s)", body.name, body.id)
    if isinstance(body.content, dict) and body.content.get("music_id"):
        container.feed.publish_track(body.content)
    return Response(status_code=status.HTTP_200_OK)
