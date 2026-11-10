"""AuthService: registration, login and token authentication."""
import pytest

from app.domain.entities import Node
from app.domain.exceptions import AuthenticationError, ConflictError, ValidationError
from app.domain.palette import NODE_PALETTE
from app.services.auth_service import MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, AuthService
from tests.unit.fakes import FakeNodeRepository, FakeUserRepository


@pytest.fixture
def empty_users():
    return FakeUserRepository()


@pytest.fixture
def graph():
    """A graph with unrelated nodes, so new ids must be allocated after the highest one."""
    return FakeNodeRepository([
        {"node_id": "3", "node_type": "Tag", "node_name": "rock"},
        {"node_id": "41", "node_type": "Music", "node_name": "song"},
    ])


@pytest.fixture
def auth(empty_users, graph, hasher, tokens):
    return AuthService(empty_users, graph, hasher, tokens)


def register(auth, username="alice", password="secret1", email="alice@example.com", **kw):
    return auth.register(email=email, username=username, password=password, **kw)


# --- registration: happy path -------------------------------------------------------------------

class TestRegister:
    def test_creates_user_with_hashed_password_and_normalized_identity(self, auth, empty_users):
        result = register(auth, username="  alice  ", email="  Alice@Example.COM ")
        stored = empty_users.get_by_id(result.user.id)
        assert stored.username == "alice"
        assert stored.email == "alice@example.com"
        assert stored.password_hash != "secret1"
        assert stored.password_hash == "hashed::secret1"

    def test_creates_linked_author_node_after_the_highest_node_id(self, auth, graph):
        result = register(auth)
        node = graph.get(result.node["node_id"])
        assert node["node_id"] == "42"
        assert node["node_type"] == "Author"
        assert node["author_id"] == result.user.id
        assert node["node_name"] == node["author_name"] == "alice"
        assert node["node_color"] in NODE_PALETTE
        assert node["node_music_likes"] == []

    def test_real_name_defaults_to_username_and_bio_to_empty(self, auth):
        node = register(auth).node
        assert node["author_real_name"] == "alice"
        assert node["author_description"] == ""

    def test_optional_real_name_and_description_are_stored(self, auth, empty_users):
        result = register(auth, real_name="Alice Liddell", description="Down the rabbit hole")
        assert result.node["author_real_name"] == "Alice Liddell"
        assert result.node["author_description"] == "Down the rabbit hole"
        assert empty_users.get_by_id(result.user.id).bio == "Down the rabbit hole"

    def test_returns_a_token_that_authenticates_the_new_user(self, auth):
        result = register(auth)
        assert auth.authenticate(result.token).id == result.user.id


# --- registration: input validation (EP + BVA) -------------------------------------------------

class TestRegisterValidation:
    @pytest.mark.parametrize(
        ("username", "valid"),
        [
            ("a", False),          # BVA: 1 char, just below the minimum
            ("ab", True),          # BVA: 2 chars, minimum
            ("a" * 40, True),      # BVA: 40 chars, maximum
            ("a" * 41, False),     # BVA: 41 chars, just above the maximum
            ("john.doe-_ 2", True),  # EP: every allowed symbol
            ("bad@name", False),   # EP: forbidden symbol
            ("   ", False),        # EP: blank once stripped
        ],
    )
    def test_username_length_and_charset(self, auth, username, valid):
        if valid:
            assert register(auth, username=username).user.username == username.strip()
        else:
            with pytest.raises(ValidationError, match="Username"):
                register(auth, username=username)

    @pytest.mark.parametrize(
        ("password", "valid"),
        [
            ("x" * (MIN_PASSWORD_LENGTH - 1), False),  # BVA: 5 chars
            ("x" * MIN_PASSWORD_LENGTH, True),         # BVA: 6 chars
            ("x" * MAX_PASSWORD_BYTES, True),          # BVA: 72 bytes (bcrypt limit)
            ("x" * (MAX_PASSWORD_BYTES + 1), False),   # BVA: 73 bytes
        ],
    )
    def test_password_length_boundaries(self, auth, password, valid):
        if valid:
            register(auth, password=password)
        else:
            with pytest.raises(ValidationError, match="Password"):
                register(auth, password=password)

    def test_password_limit_counts_utf8_bytes_not_characters(self, auth):
        """37 'ñ' are only 37 characters but 74 bytes, so bcrypt would silently truncate them."""
        with pytest.raises(ValidationError, match="bytes"):
            register(auth, password="ñ" * 37)

    def test_invalid_input_persists_nothing(self, auth, empty_users, graph):
        with pytest.raises(ValidationError):
            register(auth, password="123")
        assert empty_users.count() == 0
        assert graph.of_type("Author") == []


# --- registration: conflicts and consistency --------------------------------------------------

class TestRegisterConflicts:
    def test_duplicate_username_is_rejected(self, auth):
        register(auth)
        with pytest.raises(ConflictError, match="Username"):
            register(auth, email="other@example.com")

    def test_duplicate_email_is_rejected_regardless_of_case(self, auth):
        register(auth)
        with pytest.raises(ConflictError, match="Email"):
            register(auth, username="alice2", email="ALICE@example.com")

    def test_existing_author_node_with_same_name_is_rejected(self, empty_users, hasher, tokens):
        orphan = FakeNodeRepository([{"node_id": "1", "node_type": "Author", "node_name": "alice"}])
        auth = AuthService(empty_users, orphan, hasher, tokens)
        with pytest.raises(ConflictError, match="User already exists"):
            register(auth)
        assert empty_users.count() == 0

    def test_user_is_rolled_back_when_the_author_node_cannot_be_created(self, empty_users, hasher, tokens):
        class BrokenNodes(FakeNodeRepository):
            def create(self, node: Node) -> Node:
                raise RuntimeError("DynamoDB is down")

        auth = AuthService(empty_users, BrokenNodes(), hasher, tokens)
        with pytest.raises(RuntimeError):
            register(auth)
        assert empty_users.count() == 0, "SQLite and DynamoDB must stay consistent"

    def test_node_id_collision_is_retried_with_the_next_id(self, empty_users, hasher, tokens):
        """Another request took id 1 between list_all() and create(): the service moves on to 2."""
        class RacyNodes(FakeNodeRepository):
            def __init__(self):
                super().__init__()
                self.collisions = 1

            def create(self, node: Node) -> Node:
                if self.collisions:
                    self.collisions -= 1
                    raise ConflictError("taken")
                return super().create(node)

        result = register(AuthService(empty_users, RacyNodes(), hasher, tokens))
        assert result.node["node_id"] == "2"

    def test_gives_up_after_five_collisions_and_rolls_back(self, empty_users, hasher, tokens):
        class AlwaysTaken(FakeNodeRepository):
            attempts = 0

            def create(self, node: Node) -> Node:
                AlwaysTaken.attempts += 1
                raise ConflictError("taken")

        with pytest.raises(ConflictError, match="Could not allocate"):
            register(AuthService(empty_users, AlwaysTaken(), hasher, tokens))
        assert AlwaysTaken.attempts == 5
        assert empty_users.count() == 0


# --- login / authenticate -----------------------------------------------------------------------

class TestLogin:
    @pytest.fixture
    def registered(self, auth):
        return register(auth)

    @pytest.mark.parametrize("identifier", ["alice", " alice ", "alice@example.com", "ALICE@EXAMPLE.COM"])
    def test_login_by_username_or_email(self, auth, registered, identifier):
        result = auth.login(identifier, "secret1")
        assert result.user.id == registered.user.id
        assert result.node["node_id"] == registered.node["node_id"]
        assert auth.authenticate(result.token).id == registered.user.id

    @pytest.mark.parametrize(("identifier", "password"), [("alice", "wrong-pass"), ("nobody", "secret1")])
    def test_wrong_password_and_unknown_user_give_the_same_error(self, auth, registered, identifier, password):
        """Same message for both cases, so attackers cannot enumerate usernames."""
        with pytest.raises(AuthenticationError, match="Invalid credentials"):
            auth.login(identifier, password)

    def test_authenticate_rejects_an_invalid_token(self, auth):
        with pytest.raises(AuthenticationError):
            auth.authenticate("garbage")

    def test_authenticate_rejects_a_token_of_a_deleted_user(self, auth, empty_users, registered):
        empty_users.delete(registered.user.id)
        with pytest.raises(AuthenticationError, match="no longer exists"):
            auth.authenticate(registered.token)
