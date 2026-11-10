"""In-memory test doubles (fakes) for every port in app/interfaces.

Each fake implements the same Protocol as the real adapter, so services receive them through the
constructor without knowing the difference (Dependency Inversion + Liskov Substitution).

Repositories return *copies* of what they store, like a real database does. If a service mutates a
node and forgets to call save(), the change is lost and the test notices it.
"""
import copy
import dataclasses
import io
from collections.abc import Iterable
from typing import BinaryIO

from app.domain.entities import EmbeddedImage, Node, StoredObject, User
from app.domain.exceptions import AuthenticationError, ConflictError


class FakeUserRepository:
    def __init__(self, users: Iterable[User] = ()):
        self._by_id: dict[str, User] = {}
        self.update_calls = 0
        for user in users:
            self.add(user)

    def add(self, user: User) -> User:
        self._by_id[user.id] = dataclasses.replace(user)
        return dataclasses.replace(user)

    def get_by_id(self, user_id: str) -> User | None:
        user = self._by_id.get(user_id)
        return dataclasses.replace(user) if user else None

    def get_by_username(self, username: str) -> User | None:
        return next((dataclasses.replace(u) for u in self._by_id.values() if u.username == username), None)

    def get_by_email(self, email: str) -> User | None:
        return next((dataclasses.replace(u) for u in self._by_id.values() if u.email == email), None)

    def update(self, user: User) -> User:
        self.update_calls += 1
        self._by_id[user.id] = dataclasses.replace(user)
        return dataclasses.replace(user)

    def delete(self, user_id: str) -> None:
        self._by_id.pop(user_id, None)

    def count(self) -> int:
        return len(self._by_id)


class FakeNodeRepository:
    def __init__(self, nodes: Iterable[Node] = ()):
        self._nodes: dict[str, Node] = {}
        self.created: list[str] = []
        for node in nodes:
            self._nodes[node["node_id"]] = copy.deepcopy(node)

    def list_all(self) -> list[Node]:
        return [copy.deepcopy(n) for n in self._nodes.values()]

    def get(self, node_id: str) -> Node | None:
        node = self._nodes.get(node_id)
        return copy.deepcopy(node) if node else None

    def find_author_by_author_id(self, author_id: str) -> Node | None:
        return next(
            (copy.deepcopy(n) for n in self._nodes.values()
             if n.get("node_type") == "Author" and n.get("author_id") == author_id),
            None,
        )

    def create(self, node: Node) -> Node:
        if node["node_id"] in self._nodes:
            raise ConflictError(f"Node {node['node_id']} already exists")
        self._nodes[node["node_id"]] = copy.deepcopy(node)
        self.created.append(node["node_id"])
        return copy.deepcopy(node)

    def save(self, node: Node) -> Node:
        self._nodes[node["node_id"]] = copy.deepcopy(node)
        return copy.deepcopy(node)

    def save_many(self, nodes: Iterable[Node]) -> None:
        for node in nodes:
            self.save(node)

    # test helpers
    def of_type(self, node_type: str) -> list[Node]:
        return [n for n in self.list_all() if n.get("node_type") == node_type]


class FakePasswordHasher:
    def hash(self, password: str) -> str:
        return f"hashed::{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == f"hashed::{password}"


class FakeTokenService:
    _PREFIX = "token::"

    def issue(self, user_id: str) -> str:
        return f"{self._PREFIX}{user_id}"

    def verify(self, token: str) -> str:
        if not token.startswith(self._PREFIX):
            raise AuthenticationError("Invalid or expired token")
        return token.removeprefix(self._PREFIX)


class FakeObjectStorage:
    def __init__(self, base_url: str = "http://storage.test"):
        self._base_url = base_url
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}
        self.deleted: list[tuple[str, str]] = []

    def ensure_bucket(self, bucket: str, public_read: bool = True) -> None:
        return None

    def upload(self, bucket: str, key: str, data: BinaryIO, content_type: str) -> StoredObject:
        self.objects[(bucket, key)] = (data.read(), content_type)
        return StoredObject(bucket=bucket, key=key, url=self.public_url(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        self.deleted.append((bucket, key))
        self.objects.pop((bucket, key), None)

    def public_url(self, bucket: str, key: str) -> str:
        return f"{self._base_url}/{bucket}/{key}"


class FakeCoverExtractor:
    """Returns a fixed image (or None) and, like the real one, leaves the stream rewound."""

    def __init__(self, image: EmbeddedImage | None = None):
        self._image = image

    def extract(self, stream: BinaryIO, filename: str) -> EmbeddedImage | None:
        stream.read()
        stream.seek(0)
        return self._image


class FakeImageProcessor:
    """Accepts every image unchanged unless told it is invalid."""

    def __init__(self, valid: bool = True):
        self._valid = valid

    def normalize(self, image: EmbeddedImage) -> EmbeddedImage | None:
        return image if self._valid else None


def make_user(user_id: str = "u1", username: str = "alice", email: str = "alice@example.com", **kw) -> User:
    return User(id=user_id, email=email, username=username, password_hash="hashed::secret1", **kw)


def make_author_node(node_id: str, user: User, **extra) -> Node:
    from app.services.node_factory import empty_node

    node = empty_node(node_id, "Author", user.username, "#f22452")
    node.update({"author_id": user.id, "author_name": user.username, "author_description": user.bio,
                 "author_profile_picture": "", "node_music_likes": []})
    node.update(extra)
    return node


def bytes_stream(data: bytes = b"payload") -> io.BytesIO:
    return io.BytesIO(data)
