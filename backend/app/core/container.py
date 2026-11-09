"""Composition root: the only place that knows which concrete implementations are used."""
from dataclasses import dataclass

from app.core.config import Settings
from app.infrastructure.dynamo_node_repository import DynamoNodeRepository
from app.infrastructure.security import BcryptPasswordHasher, JwtTokenService
from app.infrastructure.silo_object_storage import SiloObjectStorage
from app.infrastructure.sqlite_user_repository import SqliteUserRepository
from app.interfaces.repositories import NodeRepository, UserRepository
from app.interfaces.storage import ObjectStorage
from app.services.album_service import AlbumService
from app.services.auth_service import AuthService
from app.services.like_service import LikeService
from app.services.live_feed import LiveFeed
from app.services.media_service import MediaService
from app.services.node_service import NodeService
from app.services.profile_service import ProfileService


@dataclass
class Container:
    users: UserRepository
    nodes: NodeRepository
    storage: ObjectStorage
    auth: AuthService
    node_service: NodeService
    profiles: ProfileService
    likes: LikeService
    albums: AlbumService
    media: MediaService
    feed: LiveFeed


def build_container(
    settings: Settings,
    users: UserRepository | None = None,
    nodes: NodeRepository | None = None,
    storage: ObjectStorage | None = None,
) -> Container:
    """Wire every service. Repositories/storage can be injected (e.g. in-memory fakes for tests)."""
    users = users or SqliteUserRepository(settings.sqlite_path)
    nodes = nodes or DynamoNodeRepository(
        table_name=settings.dynamodb_table,
        endpoint_url=settings.dynamodb_endpoint,
        region=settings.dynamodb_region,
        access_key=settings.aws_access_key_id,
        secret_key=settings.aws_secret_access_key,
    )
    storage = storage or SiloObjectStorage(
        endpoint_url=settings.s3_endpoint,
        public_endpoint=settings.s3_public_endpoint,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
    )
    media = MediaService(
        storage,
        music_bucket=settings.bucket_music,
        cover_bucket=settings.bucket_music_cover,
        avatar_bucket=settings.bucket_profile_picture,
        max_audio_size=settings.max_audio_size,
        max_image_size=settings.max_image_size,
    )
    return Container(
        users=users,
        nodes=nodes,
        storage=storage,
        auth=AuthService(
            users,
            nodes,
            BcryptPasswordHasher(),
            JwtTokenService(settings.jwt_secret, settings.jwt_algorithm, settings.jwt_expires_minutes),
        ),
        node_service=NodeService(nodes),
        profiles=ProfileService(users, nodes, media),
        likes=LikeService(nodes),
        albums=AlbumService(nodes),
        media=media,
        feed=LiveFeed(nodes, settings.feed_poll_seconds),
    )
