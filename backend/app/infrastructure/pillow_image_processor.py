"""Image validation and normalization with Pillow."""
import io

from PIL import Image, ImageOps

from app.domain.entities import EmbeddedImage

WEB_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
MAX_SIDE = 1200          # covers larger than this are downscaled
MAX_BYTES = 1024 * 1024  # covers heavier than this are re-encoded


class PillowImageProcessor:
    @staticmethod
    def _open(data: bytes) -> Image.Image:
        image = Image.open(io.BytesIO(data))
        image.load()
        return image

    def normalize(self, image: EmbeddedImage) -> EmbeddedImage | None:
        try:
            img = self._open(image.data)
        except Exception:
            return None
        fmt = img.format or ""
        if fmt in WEB_FORMATS and len(image.data) <= MAX_BYTES and max(img.size) <= MAX_SIDE:
            return EmbeddedImage(image.data, WEB_FORMATS[fmt])  # trust the real format, not the tag

        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=88, optimize=True)
        return EmbeddedImage(out.getvalue(), "image/jpeg")
