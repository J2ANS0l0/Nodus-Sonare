"""Cover extraction (mutagen), dominant color (Pillow) and the upload -> album flow."""
import io

from mutagen.id3 import APIC, ID3, TIT2
from PIL import Image

from app.domain.entities import EmbeddedImage
from app.infrastructure.mutagen_cover_extractor import MutagenCoverExtractor
from app.infrastructure.pillow_image_processor import PillowImageProcessor
from tests.test_api import ctx, register  # noqa: F401  (pytest fixture reuse)

# One silent MPEG-1 Layer III frame (128 kbps, 44.1 kHz) = 417 bytes
MP3_FRAME = b"\xff\xfb\x90\x64" + b"\x00" * 413


def make_image(size=(60, 60), background=(128, 128, 128), accent=None, fmt="PNG") -> bytes:
    img = Image.new("RGB", size, background)
    if accent:  # a vivid square covering ~30% of the image
        for x in range(0, int(size[0] * 0.55)):
            for y in range(0, int(size[1] * 0.55)):
                img.putpixel((x, y), accent)
    out = io.BytesIO()
    img.save(out, format=fmt)
    return out.getvalue()


def make_mp3(cover: bytes | None, mime="image/png", path=None) -> bytes:
    path.write_bytes(MP3_FRAME * 20)
    tags = ID3()
    tags.add(TIT2(encoding=3, text="Song"))
    if cover:
        tags.add(APIC(encoding=3, mime=mime, type=3, desc="Cover", data=cover))
    tags.save(path)
    return path.read_bytes()


def test_extracts_front_cover_from_mp3(tmp_path):
    cover = make_image(accent=(220, 30, 30))
    data = make_mp3(cover, path=tmp_path / "a.mp3")
    image = MutagenCoverExtractor().extract(io.BytesIO(data), "a.mp3")
    assert image is not None and image.data == cover


def test_mp3_without_cover_and_garbage_return_none(tmp_path):
    assert MutagenCoverExtractor().extract(io.BytesIO(make_mp3(None, path=tmp_path / "b.mp3")), "b.mp3") is None
    assert MutagenCoverExtractor().extract(io.BytesIO(b"not audio at all"), "x.mp3") is None


def test_dominant_color_prefers_vivid_subject_over_dull_background():
    processor = PillowImageProcessor()
    color = processor.dominant_color(EmbeddedImage(make_image(accent=(220, 30, 30)), "image/png"))
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    assert r > 180 and g < 80 and b < 80, color


def test_dominant_color_of_greyscale_cover_is_its_main_grey():
    color = PillowImageProcessor().dominant_color(EmbeddedImage(make_image(background=(90, 90, 90)), "image/png"))
    assert color == "#5a5a5a"


def test_normalize_trusts_real_format_and_rejects_non_images():
    processor = PillowImageProcessor()
    jpeg = make_image(fmt="JPEG")
    assert processor.normalize(EmbeddedImage(jpeg, "image/png")).mime == "image/jpeg"
    assert processor.normalize(EmbeddedImage(b"nope", "image/png")) is None


def test_each_track_gets_its_own_cover_and_color(ctx, tmp_path):  # noqa: F811
    client, container, storage = ctx
    registered, headers = register(client)

    red = make_mp3(make_image(accent=(220, 30, 30)), path=tmp_path / "red.mp3")
    blue = make_mp3(make_image(accent=(30, 60, 220)), path=tmp_path / "blue.mp3")
    bare = make_mp3(None, path=tmp_path / "bare.mp3")

    uploads = []
    for name, data in (("red.mp3", red), ("blue.mp3", blue), ("bare.mp3", bare)):
        res = client.post("/api/upload/music", headers=headers, files={"file": (name, io.BytesIO(data), "audio/mpeg")})
        assert res.status_code == 201, res.text
        uploads.append(res.json())

    assert uploads[0]["cover_url"] and uploads[1]["cover_url"] and uploads[0]["cover_url"] != uploads[1]["cover_url"]
    assert uploads[2]["cover_url"] is None and uploads[2]["color"] is None
    assert sum(1 for bucket, _ in storage.objects if bucket == "music-cover") == 2

    res = client.post("/api/album/upload", headers=headers, json={
        "album_name": "Colors", "author_name": "alice",
        "tracks": [{"name": n, "url": u["url"], "cover_url": u["cover_url"] or "", "color": u["color"]}
                   for n, u in zip(("Red", "Blue", "Bare"), uploads)],
    })
    assert res.status_code == 201, res.text
    red_node, blue_node, bare_node = res.json()["nodes"]
    author_color = registered["node"]["node_color"]
    assert red_node["music_cover_url"] == uploads[0]["cover_url"] and red_node["node_color"] == uploads[0]["color"]
    assert blue_node["music_cover_url"] == uploads[1]["cover_url"] and blue_node["node_color"] == uploads[1]["color"]
    assert bare_node["music_cover_url"] == "" and bare_node["node_color"] == author_color  # falls back to author color


def test_same_artwork_is_stored_once(ctx, tmp_path):  # noqa: F811
    client, _, storage = ctx
    _, headers = register(client)
    cover = make_image(accent=(30, 200, 90))
    urls = set()
    for i in range(3):
        data = make_mp3(cover, path=tmp_path / f"t{i}.mp3")
        urls.add(client.post("/api/upload/music", headers=headers,
                             files={"file": (f"t{i}.mp3", io.BytesIO(data), "audio/mpeg")}).json()["cover_url"])
    assert len(urls) == 1
    assert sum(1 for bucket, _ in storage.objects if bucket == "music-cover") == 1


def test_subject_in_many_shades_beats_flat_dark_background():
    """Like the Minecraft cover: a flat dark-green background (largest single shade) and a grass subject
    painted in several lighter greens plus some brown dirt. The representative color is the light green."""
    img = Image.new("RGB", (100, 100), (41, 63, 24))  # flat dark green, 45% of the image
    shades = [(115, 171, 66), (100, 150, 55), (130, 185, 75), (90, 135, 50)]
    for x in range(30, 100):
        for y in range(0, 45):
            img.putpixel((x, y), shades[(x // 5 + y // 5) % len(shades)])  # 31% light greens
        for y in range(45, 79):
            img.putpixel((x, y), (98, 78, 47))  # 24% brown dirt
    out = io.BytesIO()
    img.save(out, format="PNG")
    color = PillowImageProcessor().dominant_color(EmbeddedImage(out.getvalue(), "image/png"))
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    assert g > 130 and g > r and g > b, color  # a light green, not the dark background nor the brown
