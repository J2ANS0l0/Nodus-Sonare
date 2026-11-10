"""Composition root: the only place that knows which concrete implementations are used."""
from dataclasses import dataclass

from app.core.config import Settings
from app.infrastructure.dynamo_node_repository import DynamoNodeRepository
from app.infrastructure.mutagen_cover_extractor import MutagenCoverExtractor
from app.infrastructure.pillow_image_processor import PillowImageProcessor
from app.infrastructure.security import BcryptPasswordHasher, JwtTokenService
from app.infrastructure.silo_object_storage import SiloObjectStorage
from app.infrastructure.sqlite_user_repository import SqliteUserRepository
from app.interfaces.repositories import NodeRepository, UserRepository
from app.interfaces.media import CoverExtractor, ImageProcessor
from app.interfaces.storage import ObjectStorage
from app.services.album_service import AlbumService
from app.services.artwork_service import ArtworkService
from app.services.auth_service import AuthService
from app.services.like_service import LikeService
from app.services.live_feed import LiveFeed
from app.services.media_service import MediaService
from app.services.profile_service import ProfileService


@dataclass
class Container:
    users: UserRepository
    nodes: NodeRepository
    auth: AuthService
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
    cover_extractor: CoverExtractor | None = None,
    image_processor: ImageProcessor | None = None,
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
    artwork = ArtworkService(
        extractor=cover_extractor or MutagenCoverExtractor(),
        images=image_processor or PillowImageProcessor(),
        storage=storage,
        cover_bucket=settings.bucket_music_cover,
    )
    media = MediaService(
        storage,
        music_bucket=settings.bucket_music,
        avatar_bucket=settings.bucket_profile_picture,
        max_audio_size=settings.max_audio_size,
        max_image_size=settings.max_image_size,
        artwork=artwork,
    )
    return Container(
        users=users,
        nodes=nodes,
        auth=AuthService(
            users,
            nodes,
            BcryptPasswordHasher(),
            JwtTokenService(settings.jwt_secret, settings.jwt_algorithm, settings.jwt_expires_minutes),
        ),
        profiles=ProfileService(users, nodes, media),
        likes=LikeService(nodes),
        albums=AlbumService(nodes),
        media=media,
        feed=LiveFeed(nodes, settings.feed_poll_seconds),
    )
