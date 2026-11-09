"""User profile: author node data (DynamoDB) + account data (SQLite) + avatar (Silo)."""
import logging

from app.domain.entities import IncomingFile, Node, User
from app.domain.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.interfaces.repositories import NodeRepository, UserRepository
from app.services.media_service import MediaService

log = logging.getLogger(__name__)

EDITABLE_FIELDS = ("node_name", "author_name", "author_description", "node_color")


class ProfileService:
    def __init__(self, users: UserRepository, nodes: NodeRepository, media: MediaService):
        self._users = users
        self._nodes = nodes
        self._media = media

    def get_author_node(self, user: User) -> Node:
        node = self._nodes.find_author_by_author_id(user.id)
        if not node:
            raise NotFoundError("Author node not found for this user")
        return node

    def update_profile(self, user: User, node_id: str, changes: dict[str, str | None]) -> Node:
        node = self._nodes.get(node_id)
        if not node:
            raise NotFoundError("Node not found")
        if node.get("node_type") != "Author" or node.get("author_id") != user.id:
            raise PermissionDeniedError("You can only edit your own profile")

        for field in EDITABLE_FIELDS:
            value = changes.get(field)
            if value is not None:
                node[field] = value.strip() if field != "author_description" else value
        if not node["node_name"]:
            raise ValidationError("Node name cannot be empty")
        self._nodes.save(node)

        description = changes.get("author_description")
        if description is not None and description != user.bio:
            user.bio = description
            self._users.update(user)
        return node

    def update_picture(self, user: User, file: IncomingFile) -> tuple[User, Node]:
        node = self.get_author_node(user)
        stored = self._media.upload_avatar(user, file)
        old_key = user.profile_picture_key

        user.profile_picture_key = stored.key
        user.avatar_url = stored.url
        self._users.update(user)

        node["author_profile_picture"] = stored.url
        self._nodes.save(node)

        if old_key and old_key != stored.key:
            try:
                self._media.delete_avatar(old_key)
            except Exception:  # best effort cleanup
                log.warning("Could not delete old avatar %s", old_key, exc_info=True)
        return user, node
