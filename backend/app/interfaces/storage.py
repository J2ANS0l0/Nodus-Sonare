"""Object storage port (Silo / S3 / anything else implementing it)."""
from typing import BinaryIO, Protocol

from app.domain.entities import StoredObject


class ObjectStorage(Protocol):
    def ensure_bucket(self, bucket: str, public_read: bool = True) -> None: ...

    def upload(self, bucket: str, key: str, data: BinaryIO, content_type: str) -> StoredObject: ...

    def delete(self, bucket: str, key: str) -> None: ...

    def public_url(self, bucket: str, key: str) -> str: ...
