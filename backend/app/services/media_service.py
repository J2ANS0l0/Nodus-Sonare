"""Validates client files and stores them in the object storage buckets."""
import mimetypes
import uuid
from pathlib import PurePath

from app.domain.entities import IncomingFile, StoredObject, TrackUpload, User
from app.domain.exceptions import ValidationError
from app.interfaces.storage import ObjectStorage
from app.services.artwork_service import ArtworkService

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/x-flac",
               "audio/mp4", "audio/x-m4a", "audio/aac", "audio/webm"}

# Explicit extension per accepted type: mimetypes.guess_extension() returns None for several of them
# (audio/wav, audio/flac, ...) and its answers vary between Windows and Linux.
EXTENSIONS = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg",
    "audio/flac": ".flac", "audio/x-flac": ".flac", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
    "audio/aac": ".aac", "audio/webm": ".webm",
}


class MediaService:
    def __init__(
        self,
        storage: ObjectStorage,
        music_bucket: str,
        avatar_bucket: str,
        max_audio_size: int,
        max_image_size: int,
        artwork: ArtworkService,
    ):
        self._storage = storage
        self._artwork = artwork
        self._music_bucket = music_bucket
        self._avatar_bucket = avatar_bucket
        self._max_audio = max_audio_size
        self._max_image = max_image_size

    def upload_track(self, user: User, file: IncomingFile) -> TrackUpload:
        """Store the audio and, when it has embedded artwork, its cover."""
        content_type = self._check(file, AUDIO_TYPES, self._max_audio, "audio")
        cover = self._artwork.from_audio(user, file.stream, file.filename)
        file.stream.seek(0)
        audio = self._storage.upload(self._music_bucket, self._key(user, file, content_type), file.stream, content_type)
        return TrackUpload(audio=audio, cover=cover)

    def upload_avatar(self, user: User, file: IncomingFile) -> StoredObject:
        content_type = self._check(file, IMAGE_TYPES, self._max_image, "image")
        return self._storage.upload(self._avatar_bucket, self._key(user, file, content_type), file.stream, content_type)

    def delete_avatar(self, key: str) -> None:
        self._storage.delete(self._avatar_bucket, key)

    @staticmethod
    def _check(file: IncomingFile, allowed: set[str], max_size: int, kind: str) -> str:
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        if content_type not in allowed:
            guessed, _ = mimetypes.guess_type(file.filename)
            content_type = guessed or content_type
        if content_type not in allowed:
            raise ValidationError(f"Unsupported {kind} type: {file.content_type or 'unknown'}")
        if file.size is not None and file.size > max_size:
            raise ValidationError(f"File too large (max {max_size // (1024 * 1024)} MB)")
        return content_type

    @staticmethod
    def _key(user: User, file: IncomingFile, content_type: str) -> str:
        suffix = PurePath(file.filename).suffix.lower() or EXTENSIONS.get(content_type, "")
        return f"{user.id}/{uuid.uuid4().hex}{suffix}"
