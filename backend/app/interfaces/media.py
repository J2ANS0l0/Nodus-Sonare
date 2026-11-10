"""Media processing ports."""
from typing import BinaryIO, Protocol

from app.domain.entities import EmbeddedImage


class CoverExtractor(Protocol):
    def extract(self, stream: BinaryIO, filename: str) -> EmbeddedImage | None:
        """Return the cover embedded in an audio file, or None. Must leave the stream rewound."""
        ...


class ImageProcessor(Protocol):
    def normalize(self, image: EmbeddedImage) -> EmbeddedImage | None:
        """Validate the image and return it in a web-friendly format (None if it is not a valid image)."""
        ...

    def dominant_color(self, image: EmbeddedImage) -> str:
        """Most relevant color of the image as '#rrggbb'."""
        ...
