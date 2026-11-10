"""Helpers that build graph nodes and allocate ids."""
import pytest

from app.domain.entities import NODE_LINK_FIELDS
from app.domain.palette import NODE_PALETTE
from app.services.node_factory import empty_node, find_author_by_name, max_numeric, random_color


def test_empty_node_has_identity_fields_and_every_link_list_empty():
    node = empty_node("7", "Tag", "rock", "#09ba2e")
    assert node["node_id"] == "7"
    assert node["node_type"] == "Tag"
    assert node["node_name"] == "rock"
    assert node["node_color"] == "#09ba2e"
    assert all(node[field] == [] for field in NODE_LINK_FIELDS)


def test_empty_node_link_lists_are_independent_objects():
    """Mutating one link list must not leak into the others (shared-mutable-default bug)."""
    node = empty_node("1", "Music", "song", "#09ba2e")
    node["node_tag_links_next"].append("9")
    assert all(node[f] == [] for f in NODE_LINK_FIELDS if f != "node_tag_links_next")


def test_random_color_comes_from_the_palette():
    assert random_color() in NODE_PALETTE


class TestMaxNumeric:
    def test_empty_collection_returns_zero(self):
        """BVA: lower edge, no nodes at all."""
        assert max_numeric([], "node_id") == 0

    def test_numeric_strings_and_ints_are_compared_as_numbers(self):
        """'10' > '9' numerically, even though it sorts lower as text."""
        nodes = [{"node_id": "9"}, {"node_id": "10"}, {"node_id": 3}]
        assert max_numeric(nodes, "node_id") == 10

    @pytest.mark.parametrize("bad", [None, "abc", "", [1]])
    def test_non_numeric_or_missing_values_are_ignored(self, bad):
        """EP: invalid partition for the field value."""
        assert max_numeric([{"node_id": bad}, {"node_id": "4"}, {}], "node_id") == 4

    def test_negative_values_never_go_below_zero(self):
        assert max_numeric([{"music_id": "-5"}], "music_id") == 0


class TestFindAuthorByName:
    NODES = [
        {"node_type": "Tag", "node_name": "alice"},
        {"node_type": "Author", "node_name": "Bob", "author_name": "bob_b"},
        {"node_type": "Author", "node_name": "Alice", "author_name": "alice"},
    ]

    def test_matches_by_node_name(self):
        assert find_author_by_name(self.NODES, "Bob")["author_name"] == "bob_b"

    def test_matches_by_author_name(self):
        assert find_author_by_name(self.NODES, "alice")["node_name"] == "Alice"

    def test_ignores_non_author_nodes_and_returns_none_when_missing(self):
        assert find_author_by_name(self.NODES[:1], "alice") is None
        assert find_author_by_name(self.NODES, "carol") is None
