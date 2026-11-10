"""Extracts embedded artwork from audio files with mutagen (MP3/AIFF/WAV ID3, FLAC, MP4/M4A, Ogg Vorbis/Opus)."""
import base64
import logging
from typing import Any, BinaryIO

import mutagen
from mutagen.flac import Picture

from app.domain.entities import EmbeddedImage

log = logging.getLogger(__name__)

FRONT_COVER = 3  # ID3 / FLAC picture type


def _best(pictures: list[Any]) -> Any | None:
    """Prefer the front cover, otherwise the first picture."""
    pictures = [p for p in pictures if getattr(p, "data", None)]
    return next((p for p in pictures if getattr(p, "type", None) == FRONT_COVER), pictures[0] if pictures else None)


class MutagenCoverExtractor:
    def extract(self, stream: BinaryIO, filename: str) -> EmbeddedImage | None:
        try:
            stream.seek(0)
            audio = mutagen.File(stream)
            return self._from_audio(audio) if audio is not None else None
        except Exception:  # corrupt or unsupported file: simply no cover
            log.info("Could not read artwork from %s", filename, exc_info=True)
            return None
        finally:
            stream.seek(0)

    @staticmethod
    def _from_audio(audio: Any) -> EmbeddedImage | None:
        # FLAC
        pictures = getattr(audio, "pictures", None)
        if pictures:
            picture = _best(pictures)
            if picture:
                return EmbeddedImage(picture.data, picture.mime or "")

        tags = audio.tags
        if tags is None:
            return None

        # ID3 (MP3, AIFF, WAV)
        if hasattr(tags, "getall"):
            picture = _best(tags.getall("APIC") + tags.getall("PIC"))
            if picture:
                return EmbeddedImage(picture.data, getattr(picture, "mime", "") or "")

        # MP4 / M4A
        covers = tags.get("covr") if hasattr(tags, "get") else None
        if covers:
            return EmbeddedImage(bytes(covers[0]), "")

        # Ogg Vorbis / Opus (base64 FLAC picture blocks)
        blocks = tags.get("metadata_block_picture") if hasattr(tags, "get") else None
        if blocks:
            decoded = []
            for block in blocks:
                try:
                    decoded.append(Picture(base64.b64decode(block)))
                except Exception:
                    continue
            picture = _best(decoded)
            if picture:
                return EmbeddedImage(picture.data, picture.mime or "")
        return None
