"""MediaService (file validation + storage) and ArtworkService (embedded cover art)."""
import hashlib

import pytest

from app.domain.entities import EmbeddedImage, IncomingFile
from app.domain.exceptions import ValidationError
from app.services.artwork_service import ArtworkService
from app.services.media_service import AUDIO_TYPES, EXTENSIONS, IMAGE_TYPES, MediaService
from tests.unit.fakes import FakeCoverExtractor, FakeImageProcessor, bytes_stream

MAX_AUDIO = 1000
MAX_IMAGE = 500
COVER = EmbeddedImage(data=b"\x89PNG-cover-bytes", mime="image/png")


def incoming(name="song.mp3", content_type="audio/mpeg", data=b"ID3-audio", size=None) -> IncomingFile:
    return IncomingFile(stream=bytes_stream(data), filename=name, content_type=content_type,
                        size=len(data) if size is None else size)


def build_media(storage, cover=None, valid_image=True) -> MediaService:
    artwork = ArtworkService(FakeCoverExtractor(cover), FakeImageProcessor(valid_image), storage, "music-cover")
    return MediaService(storage, music_bucket="music", avatar_bucket="profile-picture",
                        max_audio_size=MAX_AUDIO, max_image_size=MAX_IMAGE, artwork=artwork)


# --- ArtworkService -----------------------------------------------------------------------------

class TestArtworkService:
    def artwork(self, storage, cover=COVER, valid=True):
        return ArtworkService(FakeCoverExtractor(cover), FakeImageProcessor(valid), storage, "music-cover")

    def test_audio_without_embedded_art_stores_nothing(self, storage, user):
        assert self.artwork(storage, cover=None).from_audio(user, bytes_stream(), "a.mp3") is None
        assert storage.objects == {}

    def test_invalid_embedded_image_is_ignored(self, storage, user):
        assert self.artwork(storage, valid=False).from_audio(user, bytes_stream(), "a.mp3") is None
        assert storage.objects == {}

    def test_valid_cover_is_stored_under_a_content_hash_key(self, storage, user):
        stored = self.artwork(storage).from_audio(user, bytes_stream(), "a.mp3")
        digest = hashlib.sha256(COVER.data).hexdigest()[:32]
        assert stored.bucket == "music-cover"
        assert stored.key == f"{user.id}/{digest}.png"
        assert storage.objects[("music-cover", stored.key)] == (COVER.data, "image/png")

    def test_same_cover_in_two_tracks_maps_to_one_object(self, storage, user):
        """Every track of an album shares its art: one object, not one per track."""
        service = self.artwork(storage)
        first = service.from_audio(user, bytes_stream(b"track1"), "1.mp3")
        second = service.from_audio(user, bytes_stream(b"track2"), "2.mp3")
        assert first.key == second.key
        assert len(storage.objects) == 1

    def test_unknown_image_mime_falls_back_to_img_extension(self, storage, user):
        odd = EmbeddedImage(data=b"???", mime="image/x-unknown-format")
        assert self.artwork(storage, cover=odd).from_audio(user, bytes_stream(), "a.mp3").key.endswith(".img")


# --- MediaService: tracks -----------------------------------------------------------------------

class TestUploadTrack:
    def test_audio_is_stored_in_the_music_bucket_under_the_user(self, storage, user):
        result = build_media(storage).upload_track(user, incoming())
        assert result.audio.bucket == "music"
        assert result.audio.key.startswith(f"{user.id}/") and result.audio.key.endswith(".mp3")
        assert storage.objects[("music", result.audio.key)] == (b"ID3-audio", "audio/mpeg")
        assert result.cover is None

    def test_embedded_cover_is_returned_and_audio_is_uploaded_complete(self, storage, user):
        """The extractor reads the stream; the full audio must still be uploaded (stream rewound)."""
        result = build_media(storage, cover=COVER).upload_track(user, incoming(data=b"full-audio-bytes"))
        assert result.cover.bucket == "music-cover"
        assert storage.objects[("music", result.audio.key)][0] == b"full-audio-bytes"

    def test_two_uploads_of_the_same_file_get_different_keys(self, storage, user):
        media = build_media(storage)
        assert media.upload_track(user, incoming()).audio.key != media.upload_track(user, incoming()).audio.key

    @pytest.mark.parametrize("content_type", ["AUDIO/MPEG", "audio/mpeg; charset=binary", " audio/flac "])
    def test_content_type_is_normalized(self, storage, user, content_type):
        """EP: valid partition written in different ways (case, parameters, spaces)."""
        result = build_media(storage).upload_track(user, incoming(content_type=content_type))
        assert storage.objects[("music", result.audio.key)][1] in AUDIO_TYPES

    def test_generic_content_type_falls_back_to_the_file_extension(self, storage, user):
        result = build_media(storage).upload_track(user, incoming(content_type="application/octet-stream"))
        assert storage.objects[("music", result.audio.key)][1] in AUDIO_TYPES

    @pytest.mark.parametrize(
        ("name", "content_type", "shown"),
        [("notes.txt", "text/plain", "text/plain"), ("blob", "", "unknown"), ("pic.png", "image/png", "image/png")],
    )
    def test_non_audio_files_are_rejected(self, storage, user, name, content_type, shown):
        """EP: invalid partitions (text, no type at all, an image sent as a track)."""
        with pytest.raises(ValidationError, match=f"Unsupported audio type: {shown}"):
            build_media(storage).upload_track(user, incoming(name=name, content_type=content_type))
        assert storage.objects == {}

    @pytest.mark.parametrize(("size", "accepted"), [(MAX_AUDIO, True), (MAX_AUDIO + 1, False), (None, True)])
    def test_audio_size_limit(self, storage, user, size, accepted):
        """BVA: exactly the limit passes, one byte more fails; unknown size (None) is allowed."""
        file = incoming(size=size) if size is not None else IncomingFile(bytes_stream(), "a.mp3", "audio/mpeg", None)
        if accepted:
            build_media(storage).upload_track(user, file)
        else:
            with pytest.raises(ValidationError, match="too large"):
                build_media(storage).upload_track(user, file)

    @pytest.mark.parametrize("content_type", sorted(AUDIO_TYPES))
    def test_file_without_extension_gets_one_from_its_type(self, storage, user, content_type):
        """Regression: audio/wav and audio/flac used to be stored with no extension at all."""
        result = build_media(storage).upload_track(user, incoming(name="track", content_type=content_type))
        assert result.audio.key.endswith(EXTENSIONS[content_type])


def test_every_accepted_type_has_an_explicit_extension():
    """Guard: accepting a new MIME type without mapping its extension fails the build."""
    assert AUDIO_TYPES | IMAGE_TYPES <= EXTENSIONS.keys()


# --- MediaService: avatars ----------------------------------------------------------------------

class TestAvatar:
    def test_image_is_stored_in_the_profile_picture_bucket(self, storage, user):
        stored = build_media(storage).upload_avatar(user, incoming("me.PNG", "image/png", b"img"))
        assert stored.bucket == "profile-picture"
        assert stored.key.endswith(".png")
        assert storage.objects[("profile-picture", stored.key)] == (b"img", "image/png")

    def test_audio_is_not_a_valid_avatar(self, storage, user):
        with pytest.raises(ValidationError, match="Unsupported image type"):
            build_media(storage).upload_avatar(user, incoming())

    @pytest.mark.parametrize(("size", "accepted"), [(MAX_IMAGE, True), (MAX_IMAGE + 1, False)])
    def test_image_size_limit(self, storage, user, size, accepted):
        """BVA on the image limit, which is independent from the audio limit."""
        file = incoming("me.jpg", "image/jpeg", size=size)
        if accepted:
            build_media(storage).upload_avatar(user, file)
        else:
            with pytest.raises(ValidationError, match="too large"):
                build_media(storage).upload_avatar(user, file)

    def test_delete_avatar_removes_it_from_the_avatar_bucket(self, storage):
        build_media(storage).delete_avatar("u1/old.png")
        assert storage.deleted == [("profile-picture", "u1/old.png")]
