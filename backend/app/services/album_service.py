"""Creates Music (and missing Tag) nodes for an uploaded album and wires every link."""
from dataclasses import dataclass

from app.domain.entities import Node, User
from app.domain.exceptions import NotFoundError, ValidationError
from app.interfaces.repositories import NodeRepository
from app.services.node_factory import empty_node, max_numeric, random_color


@dataclass(frozen=True)
class TrackInput:
    name: str
    url: str
    description: str = ""
    tag: str = ""
    cover_url: str = ""        # artwork embedded in this track's audio file


def _split_tags(raw: str | None) -> list[str]:
    seen: list[str] = []
    for tag in (raw or "").split(","):
        tag = tag.strip()
        if tag and tag not in seen:
            seen.append(tag)
    return seen


def _append_unique(node: Node, field: str, value: str) -> None:
    values = node.setdefault(field, [])
    if value not in values:
        values.append(value)


class AlbumService:
    def __init__(self, nodes: NodeRepository):
        self._nodes = nodes

    def upload(
        self,
        user: User,
        album_name: str,
        author_name: str,
        general_tag: str,
        tracks: list[TrackInput],
    ) -> list[Node]:
        album_name, author_name = album_name.strip(), author_name.strip()
        if not album_name or not author_name:
            raise ValidationError("Album name and author name are required")
        if not tracks:
            raise ValidationError("At least one track is required")
        for track in tracks:
            if not track.name.strip():
                raise ValidationError("Every track needs a name")
            if not track.url.strip():
                raise ValidationError(f"Track '{track.name}' has no audio file")

        all_nodes = self._nodes.list_all()
        by_id = {n["node_id"]: n for n in all_nodes}
        author = next((n for n in all_nodes if n.get("node_type") == "Author" and n.get("author_id") == user.id), None)
        if not author:
            raise NotFoundError("Author node not found. Please ensure the author exists.")
        author_id = author["node_id"]

        next_node_id = max_numeric(all_nodes, "node_id")
        next_music_id = max_numeric(all_nodes, "music_id")
        new_tags: dict[str, Node] = {}
        touched_tags: dict[str, Node] = {}

        def allocate_node_id() -> str:
            nonlocal next_node_id
            next_node_id += 1
            return str(next_node_id)

        def tag_ids_for(names: list[str]) -> list[str]:
            ids = []
            for name in names:
                tag = next((n for n in all_nodes if n.get("node_type") == "Tag" and n.get("node_name") == name), None)
                if not tag:
                    tag = empty_node(allocate_node_id(), "Tag", name, random_color())
                    all_nodes.append(tag)
                    by_id[tag["node_id"]] = tag
                    new_tags[tag["node_id"]] = tag
                ids.append(tag["node_id"])
            return ids

        general_tag_ids = tag_ids_for(_split_tags(general_tag))
        music_ids = [allocate_node_id() for _ in tracks]

        music_nodes: list[Node] = []
        for index, (track, node_id) in enumerate(zip(tracks, music_ids, strict=True)):
            next_music_id += 1
            track_tag_ids = list(dict.fromkeys(general_tag_ids + tag_ids_for(_split_tags(track.tag))))

            # Each track keeps its own artwork; its node color is picked at random from the palette
            node = empty_node(node_id, "Music", track.name.strip(), random_color())
            node["node_tag_links_next"] = track_tag_ids
            node["node_author_links_next"] = [author_id]
            node["node_album_links_next"] = [music_ids[index + 1]] if index + 1 < len(music_ids) else []
            node["node_album_links_previous"] = [music_ids[index - 1]] if index > 0 else []
            node.update(
                {
                    "music_id": str(next_music_id),
                    "music_name": track.name.strip(),
                    "music_description": track.description or f"{track.name.strip()} from {author_name}",
                    "music_author": author_name,
                    "music_cover_url": track.cover_url,
                    "music_url": track.url,
                    "music_album": album_name,
                    "likes": 0,
                    "views": 0,
                    "shares": 0,
                    "comments": 0,
                }
            )
            music_nodes.append(node)

            for tag_id in track_tag_ids:
                tag = by_id[tag_id]
                _append_unique(tag, "node_music_links_next", node_id)
                _append_unique(tag, "node_author_links_next", author_id)
                touched_tags[tag_id] = tag

        # New nodes use conditional writes so concurrent uploads can never overwrite each other.
        for node in [*new_tags.values(), *music_nodes]:
            self._nodes.create(node)
        self._nodes.save_many(t for tid, t in touched_tags.items() if tid not in new_tags)

        for node in music_nodes:
            _append_unique(author, "node_music_links_next", node["node_id"])
        for tag_id in touched_tags:
            _append_unique(author, "node_tag_links_next", tag_id)
        self._nodes.save(author)
        return music_nodes
