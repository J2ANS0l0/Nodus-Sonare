from fastapi import APIRouter, File, UploadFile, status

from app.api.dependencies import ContainerDep, CurrentUser, to_incoming_file
from app.api.schemas import AlbumUploadRequest, AlbumUploadResponse, MusicUploadResponse
from app.services.album_service import TrackInput

router = APIRouter(prefix="/api", tags=["media"])


@router.post("/upload/music", response_model=MusicUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_music_file(user: CurrentUser, container: ContainerDep, file: UploadFile = File(...)) -> MusicUploadResponse:
    result = container.media.upload_track(user, to_incoming_file(file))
    return MusicUploadResponse(
        bucket=result.audio.bucket,
        key=result.audio.key,
        url=result.audio.url,
        cover_url=result.cover.url if result.cover else None,
    )


@router.post("/album/upload", response_model=AlbumUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_album(body: AlbumUploadRequest, user: CurrentUser, container: ContainerDep) -> AlbumUploadResponse:
    nodes = container.albums.upload(
        user,
        album_name=body.album_name,
        author_name=body.author_name,
        general_tag=body.general_tag,
        tracks=[
            TrackInput(name=t.name, url=t.url, description=t.description, tag=t.tag, cover_url=t.cover_url)
            for t in body.tracks
        ],
    )
    return AlbumUploadResponse(message="Album uploaded successfully", count=len(nodes), nodes=nodes)
