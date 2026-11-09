"""SQLite implementation of UserRepository (stdlib sqlite3)."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

from app.domain.entities import User
from app.domain.exceptions import ConflictError

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    profile_picture_key TEXT,
    bio                 TEXT NOT NULL DEFAULT '',
    avatar_url          TEXT,
    created_at          TEXT NOT NULL
);
"""

_COLUMNS = "id, email, username, password_hash, profile_picture_key, bio, avatar_url, created_at"


class SqliteUserRepository:
    def __init__(self, db_path: Path):
        self._db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        # One short-lived connection per operation keeps this safe across worker threads.
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            with conn:  # commits or rolls back
                yield conn
        finally:
            conn.close()

    @staticmethod
    def _to_user(row: sqlite3.Row | None) -> User | None:
        if row is None:
            return None
        return User(
            id=row["id"],
            email=row["email"],
            username=row["username"],
            password_hash=row["password_hash"],
            profile_picture_key=row["profile_picture_key"],
            bio=row["bio"],
            avatar_url=row["avatar_url"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def _fetch_one(self, where: str, value: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM users WHERE {where} = ?", (value,)).fetchone()
        return self._to_user(row)

    def add(self, user: User) -> User:
        try:
            with self._connect() as conn:
                conn.execute(
                    f"INSERT INTO users ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        user.id,
                        user.email,
                        user.username,
                        user.password_hash,
                        user.profile_picture_key,
                        user.bio,
                        user.avatar_url,
                        user.created_at.isoformat(),
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise ConflictError("Email or username already registered") from exc
        return user

    def get_by_id(self, user_id: str) -> User | None:
        return self._fetch_one("id", user_id)

    def get_by_username(self, username: str) -> User | None:
        return self._fetch_one("username", username)

    def get_by_email(self, email: str) -> User | None:
        return self._fetch_one("email", email)

    def update(self, user: User) -> User:
        with self._connect() as conn:
            conn.execute(
                """UPDATE users
                   SET email = ?, username = ?, password_hash = ?, profile_picture_key = ?,
                       bio = ?, avatar_url = ?
                   WHERE id = ?""",
                (
                    user.email,
                    user.username,
                    user.password_hash,
                    user.profile_picture_key,
                    user.bio,
                    user.avatar_url,
                    user.id,
                ),
            )
        return user

    def delete(self, user_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
