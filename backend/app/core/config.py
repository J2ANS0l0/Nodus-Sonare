"""Application settings, loaded from environment variables / backend/.env."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Deployment identity (GET /api/version). APP_VERSION is baked into the Docker image at build time
    # (the commit SHA); APP_ENV is set when an environment is deployed.
    app_version: str = "dev"
    app_env: str = "local"

    # Built frontend (Vite dist/). When set, the API also serves the web UI on the same port.
    frontend_dist: Path | None = None

    # HTTP
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # SQLite (users)
    sqlite_path: Path = BACKEND_DIR / "data" / "users.db"

    # DynamoDB (graph nodes)
    dynamodb_endpoint: str = "http://localhost:8002"
    dynamodb_region: str = "us-east-1"
    dynamodb_table: str = "node"
    aws_access_key_id: str = "local"
    aws_secret_access_key: str = "local"

    # Silo (S3-compatible object storage)
    s3_endpoint: str = "http://localhost:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin123"
    s3_region: str = "us-east-1"
    bucket_music: str = "music"
    bucket_music_cover: str = "music-cover"
    bucket_profile_picture: str = "profile-picture"

    # Upload limits (bytes)
    max_audio_size: int = 50 * 1024 * 1024
    max_image_size: int = 5 * 1024 * 1024

    # Auth
    jwt_secret: str = "change-me-in-backend-env-file-please"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24

    # Live feed
    feed_poll_seconds: float = 1.0

    @field_validator("sqlite_path")
    @classmethod
    def _relative_to_backend(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BACKEND_DIR / value).resolve()

    @property
    def buckets(self) -> list[str]:
        return [self.bucket_music, self.bucket_music_cover, self.bucket_profile_picture]


@lru_cache
def get_settings() -> Settings:
    return Settings()
