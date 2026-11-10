"""Request / response models (HTTP contract)."""
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.domain.entities import User


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)
    real_name: str | None = None
    description: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, description="Username or email")
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    profile_picture_key: str | None
    bio: str
    avatar_url: str | None

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            username=user.username,
            profile_picture_key=user.profile_picture_key,
            bio=user.bio,
            avatar_url=user.avatar_url,
        )


class AuthResponse(BaseModel):
    message: str
    token: str
    user: UserOut
    node: dict[str, Any] | None


class ProfilePictureResponse(BaseModel):
    user: UserOut
    node: dict[str, Any]


class LikeRequest(BaseModel):
    music_node_id: str


class LikeResponse(BaseModel):
    message: str
    likes: list[str]


class ProfileUpdateRequest(BaseModel):
    node_id: str
    node_name: str | None = None
    author_name: str | None = None
    author_description: str | None = None
    node_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{3,8}$")


class NodeResponse(BaseModel):
    message: str
    node: dict[str, Any]


HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class TrackIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    url: str
    description: str = ""
    tag: str = ""
    cover_url: str = ""  # cover extracted from this audio file (see /api/upload/music)
    color: str | None = Field(default=None, pattern=HEX_COLOR)  # dominant color of that cover


class AlbumUploadRequest(BaseModel):
    album_name: str
    author_name: str
    general_tag: str = ""
    tracks: list[TrackIn] = Field(min_length=1)


class AlbumUploadResponse(BaseModel):
    message: str
    count: int
    nodes: list[dict[str, Any]]


class NodeSelectedRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    name: str | None = None
    content: Any = None


class MusicUploadResponse(BaseModel):
    bucket: str
    key: str
    url: str
    cover_url: str | None = None  # artwork embedded in the audio, stored in the music-cover bucket
    color: str | None = None      # most relevant color of that artwork
