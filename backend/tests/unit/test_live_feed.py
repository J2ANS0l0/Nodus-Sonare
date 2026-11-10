"""LiveFeed: the SSE hub that broadcasts graph snapshots and the selected track."""
import asyncio
import json

import pytest

from app.services.live_feed import LiveFeed
from tests.unit.fakes import FakeNodeRepository

NODE_A = {"node_id": "1", "node_type": "Tag", "node_name": "rock"}
NODE_B = {"node_id": "2", "node_type": "Tag", "node_name": "jazz"}


@pytest.fixture
def graph():
    return FakeNodeRepository([NODE_A])


@pytest.fixture
def feed(graph):
    return LiveFeed(graph, poll_seconds=0.01)


def drain(queue: asyncio.Queue) -> list[str]:
    items = []
    while not queue.empty():
        items.append(queue.get_nowait())
    return items


async def wait_for_item(queue: asyncio.Queue, timeout: float = 1.0) -> str:
    return await asyncio.wait_for(queue.get(), timeout)


class TestSubscriptions:
    async def test_new_subscriber_receives_the_current_snapshot(self, feed):
        queue = await feed.subscribe()
        assert json.loads(queue.get_nowait()) == [NODE_A]

    async def test_refresh_without_changes_publishes_nothing(self, feed):
        queue = await feed.subscribe()
        drain(queue)
        await feed.refresh()
        assert queue.empty()

    async def test_refresh_after_a_change_publishes_the_new_snapshot(self, feed, graph):
        queue = await feed.subscribe()
        drain(queue)
        graph.save(NODE_B)
        await feed.refresh()
        assert json.loads(queue.get_nowait()) == [NODE_A, NODE_B]

    async def test_unsubscribed_queue_stops_receiving(self, feed, graph):
        queue = await feed.subscribe()
        drain(queue)
        feed.unsubscribe(queue)
        graph.save(NODE_B)
        await feed.refresh()
        assert queue.empty()

    async def test_slow_client_is_dropped_when_its_queue_fills_up(self, feed):
        queue = await feed.subscribe()
        for i in range(queue.maxsize + 5):
            feed.publish_track({"node_id": str(i)})
        drain(queue)
        feed.publish_track({"node_id": "after"})
        assert queue.empty(), "a dropped client must not receive further events"


class TestCurrentTrack:
    async def test_track_event_is_broadcast_to_subscribers(self, feed):
        queue = await feed.subscribe()
        drain(queue)
        feed.publish_track({"node_id": "10"})
        assert json.loads(queue.get_nowait()) == {"__type": "track", "track": {"node_id": "10"}}

    async def test_late_subscriber_gets_snapshot_then_current_track(self, feed):
        feed.publish_track({"node_id": "10"})
        queue = await feed.subscribe()
        snapshot, track = drain(queue)
        assert json.loads(snapshot) == [NODE_A]
        assert json.loads(track)["track"] == {"node_id": "10"}


class TestPolling:
    async def test_poller_detects_changes_until_stopped(self, feed, graph):
        queue = await feed.subscribe()
        drain(queue)
        feed.start()
        feed.start()  # idempotent: a second call must not spawn a second poller
        graph.save(NODE_B)
        assert json.loads(await wait_for_item(queue)) == [NODE_A, NODE_B]
        await feed.stop()

        graph.save({"node_id": "3", "node_type": "Tag", "node_name": "pop"})
        await asyncio.sleep(0.05)
        assert queue.empty()

    async def test_poller_survives_a_repository_error(self, graph):
        class FlakyNodes(FakeNodeRepository):
            failures = 1

            def list_all(self):
                if FlakyNodes.failures:
                    FlakyNodes.failures -= 1
                    raise ConnectionError("DynamoDB timeout")
                return super().list_all()

        feed = LiveFeed(FlakyNodes([NODE_A]), poll_seconds=0.01)
        queue: asyncio.Queue = asyncio.Queue()
        feed._subscribers.add(queue)  # subscribe() would hit the failing call before the poller does
        feed.start()
        assert json.loads(await wait_for_item(queue)) == [NODE_A]
        await feed.stop()

    async def test_stop_without_start_is_a_no_op(self, feed):
        await feed.stop()
