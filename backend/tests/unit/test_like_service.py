"""LikeService: toggling a Music node in the author's node_music_likes."""
import pytest

from app.domain.exceptions import NotFoundError, ValidationError
from app.services.like_service import LikeService
from tests.unit.fakes import FakeNodeRepository, make_author_node, make_user


@pytest.fixture
def graph(user):
    return FakeNodeRepository([
        make_author_node("1", user),
        {"node_id": "10", "node_type": "Music", "node_name": "song A"},
        {"node_id": "11", "node_type": "Music", "node_name": "song B"},
        {"node_id": "20", "node_type": "Tag", "node_name": "rock"},
    ])


@pytest.fixture
def likes(graph):
    return LikeService(graph)


def test_first_toggle_likes_and_persists(likes, graph, user):
    assert likes.toggle(user, "10") == ["10"]
    assert graph.find_author_by_author_id(user.id)["node_music_likes"] == ["10"]


def test_second_toggle_unlikes(likes, graph, user):
    likes.toggle(user, "10")
    assert likes.toggle(user, "10") == []
    assert graph.find_author_by_author_id(user.id)["node_music_likes"] == []


def test_likes_accumulate_in_order(likes, user):
    likes.toggle(user, "10")
    assert likes.toggle(user, "11") == ["10", "11"]


def test_author_without_likes_field_is_handled(user):
    node = make_author_node("1", user)
    del node["node_music_likes"]
    graph = FakeNodeRepository([node, {"node_id": "10", "node_type": "Music"}])
    assert LikeService(graph).toggle(user, "10") == ["10"]


def test_user_without_author_node_is_not_found(likes):
    with pytest.raises(NotFoundError):
        likes.toggle(make_user(user_id="ghost"), "10")


@pytest.mark.parametrize("target", ["999", "20", "1"], ids=["missing", "tag-node", "author-node"])
def test_only_music_nodes_can_be_liked(likes, user, target):
    """EP: invalid partitions for the target node (does not exist / wrong node type)."""
    with pytest.raises(ValidationError, match="Music"):
        likes.toggle(user, target)
