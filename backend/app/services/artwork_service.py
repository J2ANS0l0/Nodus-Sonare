"""Stores the artwork embedded in an audio file as the track cover."""
import hashlib
import io
import logging
import mimetypes
from typing import BinaryIO

from app.domain.entities import StoredObject, User
from app.interfaces.media import CoverExtractor, ImageProcessor
from app.interfaces.storage import ObjectStorage

log = logging.getLogger(__name__)


class ArtworkService:
    def __init__(self, extractor: CoverExtractor, images: ImageProcessor, storage: ObjectStorage, cover_bucket: str):
        self._extractor = extractor
        self._images = images
        self._storage = storage
        self._cover_bucket = cover_bucket

    def from_audio(self, user: User, stream: BinaryIO, filename: str) -> StoredObject | None:
        embedded = self._extractor.extract(stream, filename)
        if embedded is None:
            return None
        image = self._images.normalize(embedded)
        if image is None:
            log.info("Embedded artwork in %s is not a valid image", filename)
            return None

        # Content-addressed key: every track of an album sharing the same art reuses one object
        digest = hashlib.sha256(image.data).hexdigest()[:32]
        extension = mimetypes.guess_extension(image.mime) or ".img"
        key = f"{user.id}/{digest}{extension}"
        return self._storage.upload(self._cover_bucket, key, io.BytesIO(image.data), image.mime)
