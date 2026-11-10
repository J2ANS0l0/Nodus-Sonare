"""Toggles a music node in the user's author node `node_music_likes` list."""
from app.domain.entities import User
from app.domain.exceptions import NotFoundError, ValidationError
from app.interfaces.repositories import NodeRepository


class LikeService:
    def __init__(self, nodes: NodeRepository):
        self._nodes = nodes

    def toggle(self, user: User, music_node_id: str) -> list[str]:
        author = self._nodes.find_author_by_author_id(user.id)
        if not author:
            raise NotFoundError("User not found")
        music = self._nodes.get(music_node_id)
        if not music or music.get("node_type") != "Music":
            raise ValidationError("music_node_id must reference a Music node")

        likes: list[str] = list(author.get("node_music_likes") or [])
        if music_node_id in likes:
            likes.remove(music_node_id)
        else:
            likes.append(music_node_id)
        author["node_music_likes"] = likes
        self._nodes.save(author)
        return likes
