"""Domain entities and type aliases."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, BinaryIO

# A graph node is stored as a free-form document with the exact shape of data/nodes.json.
Node = dict[str, Any]

NODE_LINK_FIELDS: tuple[str, ...] = (
    "node_music_links_next",
    "node_music_links_previous",
    "node_tag_links_next",
    "node_tag_links_previous",
    "node_author_links_next",
    "node_author_links_previous",
    "node_album_links_next",
    "node_album_links_previous",
)


@dataclass
class User:
    """A registered account (persisted in SQLite)."""

    id: str
    email: str
    username: str
    password_hash: str
    profile_picture_key: str | None = None  # object key inside the profile-picture bucket
    bio: str = ""
    avatar_url: str | None = None  # public URL of the object in the bucket
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class StoredObject:
    bucket: str
    key: str
    url: str


@dataclass(frozen=True)
class IncomingFile:
    """A file received from a client, independent of the web framework."""

    stream: BinaryIO
    filename: str
    content_type: str
    size: int | None
