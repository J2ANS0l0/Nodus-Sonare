"""Helpers that build nodes with the canonical RawNode shape."""
from typing import Any, Iterable

from app.domain.entities import NODE_LINK_FIELDS, Node
from app.domain.palette import random_palette_color


def empty_node(node_id: str, node_type: str, name: str, color: str) -> Node:
    node: Node = {"node_id": node_id, "node_type": node_type, "node_name": name, "node_color": color}
    for link_field in NODE_LINK_FIELDS:
        node[link_field] = []
    return node


def random_color() -> str:
    """Every node color comes from the palette of paleta.jpeg."""
    return random_palette_color()


def max_numeric(nodes: Iterable[Node], field: str) -> int:
    best = 0
    for node in nodes:
        value: Any = node.get(field)
        try:
            best = max(best, int(value))
        except (TypeError, ValueError):
            continue
    return best


def find_author_by_name(nodes: Iterable[Node], name: str) -> Node | None:
    return next(
        (n for n in nodes if n.get("node_type") == "Author" and name in (n.get("node_name"), n.get("author_name"))),
        None,
    )
