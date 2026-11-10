"""ProfileService: editing the author node, syncing the bio and replacing the avatar."""
import pytest

from app.domain.entities import IncomingFile
from app.domain.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.services.artwork_service import ArtworkService
from app.services.media_service import MediaService
from app.services.profile_service import ProfileService
from tests.unit.fakes import (
    FakeCoverExtractor,
    FakeImageProcessor,
    FakeNodeRepository,
    FakeObjectStorage,
    bytes_stream,
    make_author_node,
    make_user,
)


@pytest.fixture
def other_user():
    return make_user(user_id="u2", username="bob", email="bob@example.com")


@pytest.fixture
def graph(user, other_user):
    return FakeNodeRepository([
        make_author_node("1", user),
        make_author_node("2", other_user),
        {"node_id": "10", "node_type": "Music", "node_name": "song"},
    ])


@pytest.fixture
def media(storage):
    artwork = ArtworkService(FakeCoverExtractor(), FakeImageProcessor(), storage, "music-cover")
    return MediaService(storage, "music", "profile-picture", 1000, 1000, artwork)


@pytest.fixture
def profiles(users, graph, media):
    return ProfileService(users, graph, media)


def image(name="me.png", content_type="image/png"):
    return IncomingFile(bytes_stream(b"img"), name, content_type, 3)


class TestGetAuthorNode:
    def test_returns_the_users_author_node(self, profiles, user):
        assert profiles.get_author_node(user)["node_id"] == "1"

    def test_user_without_author_node_is_not_found(self, profiles):
        with pytest.raises(NotFoundError):
            profiles.get_author_node(make_user(user_id="ghost"))


class TestUpdateProfile:
    """Authorization rules as a decision table (DT):

    | Rule | node exists | is Author | owned by user | result            |
    |------|-------------|-----------|---------------|-------------------|
    | R1   | no          | -         | -             | NotFoundError     |
    | R2   | yes         | no        | -             | PermissionDenied  |
    | R3   | yes         | yes       | no            | PermissionDenied  |
    | R4   | yes         | yes       | yes           | updated           |
    """

    def test_r1_missing_node_is_not_found(self, profiles, user):
        with pytest.raises(NotFoundError):
            profiles.update_profile(user, "404", {"node_name": "x"})

    def test_r2_non_author_node_cannot_be_edited(self, profiles, user):
        with pytest.raises(PermissionDeniedError):
            profiles.update_profile(user, "10", {"node_name": "x"})

    def test_r3_someone_elses_profile_cannot_be_edited(self, profiles, graph, user):
        with pytest.raises(PermissionDeniedError):
            profiles.update_profile(user, "2", {"node_name": "hacked"})
        assert graph.get("2")["node_name"] == "bob"

    def test_r4_own_profile_is_updated_and_persisted(self, profiles, graph, user):
        profiles.update_profile(user, "1", {"node_name": "  Alice  ", "author_name": " ali ",
                                            "author_description": "  keeps spaces  "})
        node = graph.get("1")
        assert node["node_name"] == "Alice"
        assert node["author_name"] == "ali"
        assert node["author_description"] == "  keeps spaces  "

    def test_fields_left_as_none_are_not_touched(self, profiles, graph, user):
        before = graph.get("1")
        profiles.update_profile(user, "1", {"node_name": None, "node_color": None, "author_name": "ali"})
        after = graph.get("1")
        assert after["node_name"] == before["node_name"]
        assert after["node_color"] == before["node_color"]

    def test_non_editable_fields_are_ignored(self, profiles, graph, user):
        profiles.update_profile(user, "1", {"author_id": "u2", "node_type": "Music"})
        node = graph.get("1")
        assert (node["author_id"], node["node_type"]) == ("u1", "Author")

    def test_palette_color_is_accepted_and_stored_lowercase(self, profiles, graph, user):
        profiles.update_profile(user, "1", {"node_color": "#01DBA1"})
        assert graph.get("1")["node_color"] == "#01dba1"

    def test_color_outside_the_palette_is_rejected(self, profiles, graph, user):
        with pytest.raises(ValidationError, match="palette"):
            profiles.update_profile(user, "1", {"node_color": "#123456"})
        assert graph.get("1")["node_color"] == "#f22452"

    @pytest.mark.parametrize("name", ["", "   "])
    def test_name_cannot_become_empty(self, profiles, graph, user, name):
        with pytest.raises(ValidationError, match="empty"):
            profiles.update_profile(user, "1", {"node_name": name})
        assert graph.get("1")["node_name"] == "alice"

    def test_new_description_is_synced_to_the_user_bio(self, profiles, users, user):
        profiles.update_profile(user, "1", {"author_description": "new bio"})
        assert users.get_by_id(user.id).bio == "new bio"
        assert users.update_calls == 1

    def test_unchanged_description_does_not_write_the_user(self, profiles, users, user):
        profiles.update_profile(user, "1", {"author_description": user.bio, "node_name": "Alice"})
        assert users.update_calls == 0


class TestUpdatePicture:
    def test_new_picture_updates_user_and_node(self, profiles, users, graph, storage, user):
        updated_user, node = profiles.update_picture(user, image())
        assert updated_user.profile_picture_key.startswith(f"{user.id}/")
        assert ("profile-picture", updated_user.profile_picture_key) in storage.objects
        assert users.get_by_id(user.id).avatar_url == updated_user.avatar_url
        assert graph.get("1")["author_profile_picture"] == updated_user.avatar_url == node["author_profile_picture"]

    def test_first_picture_deletes_nothing(self, profiles, storage, user):
        profiles.update_picture(user, image())
        assert storage.deleted == []

    def test_replacing_a_picture_deletes_the_old_one(self, profiles, storage, user):
        first, _ = profiles.update_picture(user, image())
        old_key = first.profile_picture_key  # update_picture mutates the same User object, keep the value
        second, _ = profiles.update_picture(first, image())
        assert storage.deleted == [("profile-picture", old_key)]
        assert ("profile-picture", second.profile_picture_key) in storage.objects
        assert second.profile_picture_key != old_key

    def test_failure_deleting_the_old_picture_does_not_fail_the_update(self, users, graph, user):
        class FlakyDeleteStorage(FakeObjectStorage):
            def delete(self, bucket, key):
                raise ConnectionError("storage unreachable")

        storage = FlakyDeleteStorage()
        artwork = ArtworkService(FakeCoverExtractor(), FakeImageProcessor(), storage, "music-cover")
        profiles = ProfileService(users, graph, MediaService(storage, "music", "profile-picture", 1000, 1000, artwork))
        user.profile_picture_key = "u1/old.png"

        updated, _ = profiles.update_picture(user, image())
        assert updated.profile_picture_key != "u1/old.png"

    def test_invalid_file_changes_nothing(self, profiles, users, graph, storage, user):
        with pytest.raises(ValidationError):
            profiles.update_picture(user, image("song.mp3", "audio/mpeg"))
        assert storage.objects == {}
        assert users.update_calls == 0
        assert graph.get("1")["author_profile_picture"] == ""

    def test_user_without_author_node_uploads_nothing(self, profiles, storage):
        with pytest.raises(NotFoundError):
            profiles.update_picture(make_user(user_id="ghost"), image())
        assert storage.objects == {}
