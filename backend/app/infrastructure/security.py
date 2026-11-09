"""bcrypt password hashing and JWT access tokens."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.domain.exceptions import AuthenticationError


class BcryptPasswordHasher:
    def __init__(self, rounds: int = 12):
        self._rounds = rounds

    def hash(self, password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(self._rounds)).decode("utf-8")

    def verify(self, password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except ValueError:
            return False


class JwtTokenService:
    def __init__(self, secret: str, algorithm: str, expires_minutes: int):
        self._secret = secret
        self._algorithm = algorithm
        self._expires = timedelta(minutes=expires_minutes)

    def issue(self, user_id: str) -> str:
        now = datetime.now(timezone.utc)
        payload = {"sub": user_id, "iat": now, "exp": now + self._expires}
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def verify(self, token: str) -> str:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationError("Session expired, please log in again") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthenticationError("Invalid access token") from exc
        return str(payload["sub"])
