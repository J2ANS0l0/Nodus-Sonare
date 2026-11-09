"""API tests using in-memory fakes injected through the composition root (no Docker needed)."""
import copy
import io
from pathlib import Path
from typing import BinaryIO, Iterable

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.container import build_container
from app.domain.entities import Node, StoredObject
from app.domain.exceptions import ConflictError
from app.infrastructure.sqlite_user_repository import SqliteUserRepository
from app.main import create_app


class InMemoryNodeRepository:
    def __init__(self, nodes: list[Node]):
        self._nodes = {n["node_id"]: copy.deepcopy(n) for n in nodes}

    def list_all(self) -> list[Node]:
        return copy.deepcopy(list(self._nodes.values()))

    def get(self, node_id: str) -> Node | None:
        return copy.deepcopy(self._nodes.get(node_id))

    def find_author_by_author_id(self, author_id: str) -> Node | None:
        return next((copy.deepcopy(n) for n in self._nodes.values() if n.get("author_id") == author_id), None)

    def create(self, node: Node) -> Node:
        if node["node_id"] in self._nodes:
            raise ConflictError("exists")
        self._nodes[node["node_id"]] = copy.deepcopy(node)
        return node

    def save(self, node: Node) -> Node:
        self._nodes[node["node_id"]] = copy.deepcopy(node)
        return node

    def save_many(self, nodes: Iterable[Node]) -> None:
        for node in nodes:
            self.save(node)


class InMemoryStorage:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def ensure_bucket(self, bucket: str, public_read: bool = True) -> None: ...

    def upload(self, bucket: str, key: str, data: BinaryIO, content_type: str) -> StoredObject:
        self.objects[(bucket, key)] = data.read()
        return StoredObject(bucket, key, self.public_url(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        self.objects.pop((bucket, key), None)

    def public_url(self, bucket: str, key: str) -> str:
        return f"http://silo.test/{bucket}/{key}"


SEED = [
    {"node_id": "1", "node_type": "Tag", "node_name": "Indie", "node_color": "#fff",
     **{f: [] for f in ("node_music_links_next", "node_music_links_previous", "node_tag_links_next",
                        "node_tag_links_previous", "node_author_links_next", "node_author_links_previous",
                        "node_album_links_next", "node_album_links_previous")}},
]


@pytest.fixture
def ctx(tmp_path: Path):
    settings = Settings(sqlite_path=tmp_path / "users.db", jwt_secret="test-secret-that-is-at-least-32-bytes-long", _env_file=None)
    storage = InMemoryStorage()
    container = build_container(
        settings,
        users=SqliteUserRepository(settings.sqlite_path),
        nodes=InMemoryNodeRepository(SEED),
        storage=storage,
    )
    with TestClient(create_app(settings, container)) as client:
        yield client, container, storage


def register(client: TestClient, username="alice", email="alice@example.com"):
    res = client.post("/api/register", json={"email": email, "username": username, "password": "secret123"})
    assert res.status_code == 201, res.text
    data = res.json()
    return data, {"Authorization": f"Bearer {data['token']}"}


def test_register_creates_user_and_author_node(ctx):
    client, container, _ = ctx
    data, _ = register(client)
    assert data["node"]["node_type"] == "Author"
    assert data["node"]["author_id"] == data["user"]["id"]
    assert container.users.get_by_username("alice").password_hash.startswith("$2")


def test_duplicate_and_login(ctx):
    client, _, _ = ctx
    register(client)
    assert client.post("/api/register", json={"email": "b@example.com", "username": "alice",
                                              "password": "secret123"}).status_code == 409
    assert client.post("/api/login", json={"username": "alice", "password": "bad"}).status_code == 401
    assert client.post("/api/login", json={"username": "alice@example.com", "password": "secret123"}).status_code == 200


def test_mutations_require_token(ctx):
    client, _, _ = ctx
    assert client.post("/api/like", json={"music_node_id": "1"}).status_code == 401
    assert client.post("/api/profile/update", json={"node_id": "1"}).json()["error"] == "Missing access token"


def test_cannot_edit_other_profile(ctx):
    client, _, _ = ctx
    _, alice = register(client)
    bob_data, _ = register(client, "bob", "bob@example.com")
    res = client.post("/api/profile/update", headers=alice, json={"node_id": bob_data["node"]["node_id"], "node_name": "x"})
    assert res.status_code == 403


def test_profile_picture_goes_to_bucket_and_sqlite(ctx):
    client, container, storage = ctx
    data, headers = register(client)
    res = client.post("/api/profile/picture", headers=headers,
                      files={"file": ("me.png", io.BytesIO(b"\x89PNG"), "image/png")})
    assert res.status_code == 200, res.text
    user = container.users.get_by_id(data["user"]["id"])
    assert ("profile-picture", user.profile_picture_key) in storage.objects
    assert res.json()["node"]["author_profile_picture"] == user.avatar_url


def test_album_upload_links_and_likes(ctx):
    client, container, _ = ctx
    data, headers = register(client)
    res = client.post("/api/album/upload", headers=headers, json={
        "album_name": "LP", "author_name": "alice", "general_tag": "Indie, New",
        "tracks": [{"name": "A", "url": "u1"}, {"name": "B", "url": "u2", "tag": "Extra"}],
    })
    assert res.status_code == 201, res.text
    a, b = res.json()["nodes"]
    assert a["node_album_links_next"] == [b["node_id"]] and b["node_album_links_previous"] == [a["node_id"]]
    author = container.nodes.get(data["node"]["node_id"])
    assert author["node_music_links_next"] == [a["node_id"], b["node_id"]]
    assert {container.nodes.get(t)["node_name"] for t in b["node_tag_links_next"]} == {"Indie", "New", "Extra"}

    like = client.post("/api/like", headers=headers, json={"music_node_id": a["node_id"]})
    assert like.json()["likes"] == [a["node_id"]]
    unlike = client.post("/api/like", headers=headers, json={"music_node_id": a["node_id"]})
    assert unlike.json()["likes"] == []
