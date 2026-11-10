"""AlbumService: Music/Tag node creation and graph wiring for an uploaded album."""
import pytest

from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.palette import NODE_PALETTE
from app.services.album_service import AlbumService, TrackInput
from tests.unit.fakes import FakeNodeRepository, make_author_node, make_user


@pytest.fixture
def graph(user):
    return FakeNodeRepository([
        make_author_node("1", user),
        {"node_id": "5", "node_type": "Tag", "node_name": "rock", "node_color": "#09ba2e",
         "node_music_links_next": ["99"], "node_author_links_next": []},
        {"node_id": "99", "node_type": "Music", "node_name": "old song", "music_id": "7"},
    ])


@pytest.fixture
def albums(graph):
    return AlbumService(graph)


def tracks(n=3, **kw):
    return [TrackInput(name=f"Track {i}", url=f"http://s/music/{i}.mp3", **kw) for i in range(1, n + 1)]


def upload(albums, user, track_list=None, album="  Abbey Road ", author=" The Band ", tag=""):
    return albums.upload(user, album, author, tag, track_list if track_list is not None else tracks())


# --- validation ---------------------------------------------------------------------------------

class TestValidation:
    @pytest.mark.parametrize(("album", "author"), [("", "Band"), ("Album", "   "), ("  ", "")])
    def test_album_and_author_names_are_required(self, albums, user, album, author):
        with pytest.raises(ValidationError, match="required"):
            upload(albums, user, album=album, author=author)

    def test_at_least_one_track_is_required(self, albums, user):
        """BVA: 0 tracks rejected (1 track accepted in test_single_track_has_no_album_neighbours)."""
        with pytest.raises(ValidationError, match="At least one track"):
            upload(albums, user, track_list=[])

    def test_every_track_needs_a_name(self, albums, user):
        with pytest.raises(ValidationError, match="name"):
            upload(albums, user, track_list=[*tracks(1), TrackInput(name="  ", url="http://x")])

    def test_every_track_needs_an_audio_url(self, albums, user):
        with pytest.raises(ValidationError, match="no audio"):
            upload(albums, user, track_list=[TrackInput(name="Silent", url=" ")])

    def test_invalid_album_writes_nothing(self, albums, graph, user):
        before = graph.list_all()
        with pytest.raises(ValidationError):
            upload(albums, user, track_list=[TrackInput(name="Silent", url="")])
        assert graph.list_all() == before

    def test_user_without_author_node_is_rejected(self, albums):
        with pytest.raises(NotFoundError, match="Author"):
            upload(albums, make_user(user_id="ghost"))


# --- music nodes --------------------------------------------------------------------------------

class TestMusicNodes:
    def test_ids_continue_after_the_highest_node_and_music_ids(self, albums, user):
        created = upload(albums, user)
        assert [n["node_id"] for n in created] == ["100", "101", "102"]
        assert [n["music_id"] for n in created] == ["8", "9", "10"]

    def test_music_fields_are_filled_from_the_input(self, albums, graph, user):
        created = upload(albums, user, track_list=[
            TrackInput(name=" Come Together ", url="http://s/1.mp3", description="Opening track",
                       cover_url="http://s/cover.jpg"),
        ])
        node = graph.get(created[0]["node_id"])
        assert node["node_type"] == "Music"
        assert node["node_name"] == node["music_name"] == "Come Together"
        assert node["music_album"] == "Abbey Road"
        assert node["music_author"] == "The Band"
        assert node["music_description"] == "Opening track"
        assert node["music_cover_url"] == "http://s/cover.jpg"
        assert node["music_url"] == "http://s/1.mp3"
        assert node["node_color"] in NODE_PALETTE
        assert (node["likes"], node["views"], node["shares"], node["comments"]) == (0, 0, 0, 0)

    def test_missing_description_gets_a_default(self, albums, user):
        node = upload(albums, user, track_list=tracks(1))[0]
        assert node["music_description"] == "Track 1 from The Band"

    def test_tracks_are_chained_in_album_order(self, albums, user):
        a, b, c = upload(albums, user)
        assert (a["node_album_links_previous"], a["node_album_links_next"]) == ([], [b["node_id"]])
        assert (b["node_album_links_previous"], b["node_album_links_next"]) == ([a["node_id"]], [c["node_id"]])
        assert (c["node_album_links_previous"], c["node_album_links_next"]) == ([b["node_id"]], [])

    def test_single_track_has_no_album_neighbours(self, albums, user):
        """BVA: 1 track, the smallest valid album."""
        (only,) = upload(albums, user, track_list=tracks(1))
        assert only["node_album_links_previous"] == only["node_album_links_next"] == []

    def test_every_track_links_to_the_author_and_the_author_back(self, albums, graph, user):
        created = upload(albums, user)
        assert all(n["node_author_links_next"] == ["1"] for n in created)
        author = graph.find_author_by_author_id(user.id)
        assert author["node_music_links_next"] == [n["node_id"] for n in created]

    def test_all_new_music_nodes_are_persisted(self, albums, graph, user):
        created = upload(albums, user)
        assert [graph.get(n["node_id"]) for n in created] == created


# --- tags ---------------------------------------------------------------------------------------

class TestTags:
    def test_general_tags_are_split_trimmed_and_deduplicated(self, albums, graph, user):
        created = upload(albums, user, tag=" indie, jazz ,, indie ,")
        names = {graph.get(t)["node_name"] for t in created[0]["node_tag_links_next"]}
        assert names == {"indie", "jazz"}
        assert len(graph.of_type("Tag")) == 3  # rock (existing) + indie + jazz

    def test_existing_tag_is_reused_and_linked_to_the_new_music(self, albums, graph, user):
        created = upload(albums, user, tag="rock")
        rock = graph.get("5")
        assert [t for t in graph.of_type("Tag") if t["node_name"] == "rock"] == [rock]
        assert rock["node_music_links_next"] == ["99", *[n["node_id"] for n in created]]
        assert rock["node_author_links_next"] == ["1"]

    def test_new_tags_get_palette_colors_and_links_both_ways(self, albums, graph, user):
        created = upload(albums, user, track_list=tracks(1), tag="ambient")
        tag = next(t for t in graph.of_type("Tag") if t["node_name"] == "ambient")
        assert tag["node_color"] in NODE_PALETTE
        assert tag["node_music_links_next"] == [created[0]["node_id"]]
        assert tag["node_author_links_next"] == ["1"]
        assert created[0]["node_tag_links_next"] == [tag["node_id"]]

    def test_track_tags_are_merged_with_general_tags_without_duplicates(self, albums, graph, user):
        created = upload(
            albums, user, tag="rock",
            track_list=[TrackInput(name="A", url="u1", tag="rock, live"), TrackInput(name="B", url="u2")],
        )
        a_tags = [graph.get(t)["node_name"] for t in created[0]["node_tag_links_next"]]
        b_tags = [graph.get(t)["node_name"] for t in created[1]["node_tag_links_next"]]
        assert a_tags == ["rock", "live"]
        assert b_tags == ["rock"]

    def test_author_is_linked_to_every_touched_tag(self, albums, graph, user):
        upload(albums, user, tag="rock, indie")
        author = graph.find_author_by_author_id(user.id)
        tag_names = {graph.get(t)["node_name"] for t in author["node_tag_links_next"]}
        assert tag_names == {"rock", "indie"}

    def test_uploading_twice_does_not_duplicate_author_links(self, albums, graph, user):
        upload(albums, user, track_list=tracks(1), tag="rock")
        upload(albums, user, track_list=tracks(1), tag="rock")
        author = graph.find_author_by_author_id(user.id)
        assert author["node_tag_links_next"] == ["5"]
        assert len(author["node_music_links_next"]) == 2
