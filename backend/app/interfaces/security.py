"""Security ports: password hashing and access tokens."""
from typing import Protocol


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password: str, password_hash: str) -> bool: ...


class TokenService(Protocol):
    def issue(self, user_id: str) -> str: ...

    def verify(self, token: str) -> str:
        """Return the user id encoded in the token or raise AuthenticationError."""
        ...
