from fastapi import APIRouter, File, UploadFile, status

from app.api.dependencies import ContainerDep, CurrentUser, to_incoming_file
from app.api.schemas import AlbumUploadRequest, AlbumUploadResponse, UploadResponse
from app.services.album_service import TrackInput

router = APIRouter(prefix="/api", tags=["media"])


@router.post("/upload/music", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
def upload_music_file(user: CurrentUser, container: ContainerDep, file: UploadFile = File(...)) -> UploadResponse:
    stored = container.media.upload_track(user, to_incoming_file(file))
    return UploadResponse(bucket=stored.bucket, key=stored.key, url=stored.url)


@router.post("/upload/cover", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
def upload_cover_file(user: CurrentUser, container: ContainerDep, file: UploadFile = File(...)) -> UploadResponse:
    stored = container.media.upload_cover(user, to_incoming_file(file))
    return UploadResponse(bucket=stored.bucket, key=stored.key, url=stored.url)


@router.post("/album/upload", response_model=AlbumUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_album(body: AlbumUploadRequest, user: CurrentUser, container: ContainerDep) -> AlbumUploadResponse:
    nodes = container.albums.upload(
        user,
        album_name=body.album_name,
        author_name=body.author_name,
        cover_url=body.cover_url,
        general_tag=body.general_tag,
        tracks=[TrackInput(name=t.name, url=t.url, description=t.description, tag=t.tag) for t in body.tracks],
    )
    return AlbumUploadResponse(message="Album uploaded successfully", count=len(nodes), nodes=nodes)
