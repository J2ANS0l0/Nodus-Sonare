"""Registration, login and token-based authentication."""
import re
import uuid
from dataclasses import dataclass

from app.domain.entities import Node, User
from app.domain.exceptions import AuthenticationError, ConflictError, ValidationError
from app.interfaces.repositories import NodeRepository, UserRepository
from app.interfaces.security import PasswordHasher, TokenService
from app.services.node_factory import empty_node, find_author_by_name, max_numeric, random_color

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\- ]{2,40}$")
MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_BYTES = 72  # bcrypt limit


@dataclass(frozen=True)
class AuthResult:
    user: User
    node: Node | None
    token: str


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        nodes: NodeRepository,
        hasher: PasswordHasher,
        tokens: TokenService,
    ):
        self._users = users
        self._nodes = nodes
        self._hasher = hasher
        self._tokens = tokens

    # --- registration -----------------------------------------------------------------------
    def register(
        self,
        email: str,
        username: str,
        password: str,
        real_name: str | None = None,
        description: str | None = None,
    ) -> AuthResult:
        username = username.strip()
        email = email.strip().lower()
        self._validate_credentials(username, password)

        if self._users.get_by_username(username):
            raise ConflictError("Username already taken")
        if self._users.get_by_email(email):
            raise ConflictError("Email already registered")

        all_nodes = self._nodes.list_all()
        if find_author_by_name(all_nodes, username):
            raise ConflictError("User already exists")

        bio = description or ""
        user = self._users.add(
            User(
                id=uuid.uuid4().hex,
                email=email,
                username=username,
                password_hash=self._hasher.hash(password),
                bio=bio,
            )
        )
        try:
            node = self._create_author_node(user, all_nodes, real_name or username, bio)
        except Exception:
            self._users.delete(user.id)  # keep both stores consistent
            raise
        return AuthResult(user=user, node=node, token=self._tokens.issue(user.id))

    def _create_author_node(self, user: User, all_nodes: list[Node], real_name: str, bio: str) -> Node:
        node_id = max_numeric(all_nodes, "node_id") + 1
        color = random_color()
        for _ in range(5):  # retry on concurrent id allocation
            node = empty_node(str(node_id), "Author", user.username, color)
            node.update(
                {
                    "author_id": user.id,  # links the graph node to the SQLite user
                    "author_name": user.username,
                    "author_real_name": real_name,
                    "author_description": bio,
                    "author_profile_picture": user.avatar_url or "",
                    "node_music_likes": [],
                }
            )
            try:
                return self._nodes.create(node)
            except ConflictError:
                node_id += 1
        raise ConflictError("Could not allocate a node id, please retry")

    @staticmethod
    def _validate_credentials(username: str, password: str) -> None:
        if not USERNAME_RE.match(username):
            raise ValidationError("Username must be 2-40 characters (letters, numbers, space, . _ -)")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValidationError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValidationError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")

    # --- login / tokens -----------------------------------------------------------------------
    def login(self, identifier: str, password: str) -> AuthResult:
        identifier = identifier.strip()
        user = self._users.get_by_username(identifier) or self._users.get_by_email(identifier.lower())
        if not user or not self._hasher.verify(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")
        node = self._nodes.find_author_by_author_id(user.id)
        return AuthResult(user=user, node=node, token=self._tokens.issue(user.id))

    def authenticate(self, token: str) -> User:
        user_id = self._tokens.verify(token)
        user = self._users.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User no longer exists")
        return user
