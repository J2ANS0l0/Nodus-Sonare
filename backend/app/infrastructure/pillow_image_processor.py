"""Image validation, normalization and dominant-color analysis with Pillow."""
import colorsys
import io

from PIL import Image, ImageOps

from app.domain.entities import EmbeddedImage

WEB_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
MAX_SIDE = 1200          # covers larger than this are downscaled
MAX_BYTES = 1024 * 1024  # covers heavier than this are re-encoded
FALLBACK_COLOR = "#808080"


class PillowImageProcessor:
    def __init__(self, palette_size: int = 16):
        self._palette_size = palette_size

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

    def dominant_color(self, image: EmbeddedImage) -> str:
        """Pick the most relevant color the way a person would name it ("it's a green cover").

        1. Reduce the image to a palette (median cut) and drop greys / near-black / near-white swatches.
        2. Group the remaining swatches into hue families (all greens together, all browns together...),
           so a subject painted in many shades is not beaten by a flat background of a single shade.
        3. The family with the most saturated area wins.
        4. Inside it, return the most vivid, well-lit shade (not the darkest or most washed-out one).
        A fully greyscale cover returns its most common grey.
        """
        try:
            img = ImageOps.exif_transpose(self._open(image.data)).convert("RGB")
        except Exception:
            return FALLBACK_COLOR
        img.thumbnail((128, 128))
        quantized = img.quantize(colors=self._palette_size, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette() or []
        counts = quantized.getcolors() or []
        if not counts:
            return FALLBACK_COLOR

        total = sum(count for count, _ in counts)
        swatches = []  # (rgb, share, hue, saturation, value)
        for count, index in counts:
            rgb = tuple(palette[index * 3: index * 3 + 3])
            hue, sat, val = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
            swatches.append((rgb, count / total, hue, sat, val))

        colorful = [sw for sw in swatches if sw[3] >= MIN_SATURATION and sw[4] >= MIN_VALUE]
        if not colorful:  # greyscale artwork
            return _hex(max(swatches, key=lambda sw: sw[1])[0])

        # Greedy hue clustering, heaviest swatches first
        families: list[dict] = []
        for sw in sorted(colorful, key=lambda sw: sw[1] * sw[3], reverse=True):
            family = next((f for f in families if _hue_distance(f["hue"], sw[2]) <= HUE_FAMILY_WIDTH), None)
            if family is None:
                families.append({"hue": sw[2], "weight": 0.0, "swatches": []})
                family = families[-1]
            family["weight"] += sw[1] * sw[3]
            family["swatches"].append(sw)
        winner = max(families, key=lambda f: f["weight"])

        def representativeness(sw) -> float:
            _, share, _, sat, val = sw
            lighting = max(0.05, 1.0 - abs(val - TARGET_VALUE) * 1.6)  # prefer well-lit shades
            return share ** 0.35 * sat * lighting

        return _hex(max(winner["swatches"], key=representativeness)[0])


MIN_SATURATION = 0.18   # below this a swatch is considered grey
MIN_VALUE = 0.12        # below this a swatch is considered black
HUE_FAMILY_WIDTH = 25 / 360
TARGET_VALUE = 0.72     # brightness of the preferred shade inside the winning family


def _hue_distance(a: float, b: float) -> float:
    d = abs(a - b) % 1.0
    return min(d, 1.0 - d)


def _hex(rgb) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)
