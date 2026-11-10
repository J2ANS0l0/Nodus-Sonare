from fastapi import APIRouter, File, UploadFile

from app.api.dependencies import ContainerDep, CurrentUser, to_incoming_file
from app.api.schemas import (
    LikeRequest,
    LikeResponse,
    NodeResponse,
    PaletteResponse,
    ProfilePictureResponse,
    ProfileUpdateRequest,
    UserOut,
)
from app.domain.palette import NODE_PALETTE

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/palette", response_model=PaletteResponse)
def palette() -> PaletteResponse:
    """Colors a node can have (taken from paleta.jpeg)."""
    return PaletteResponse(colors=list(NODE_PALETTE))


@router.post("/profile/update", response_model=NodeResponse)
def update_profile(body: ProfileUpdateRequest, user: CurrentUser, container: ContainerDep) -> NodeResponse:
    node = container.profiles.update_profile(user, body.node_id, body.model_dump(exclude={"node_id"}))
    return NodeResponse(message="Success", node=node)


@router.post("/profile/picture", response_model=ProfilePictureResponse)
def update_profile_picture(
    user: CurrentUser,
    container: ContainerDep,
    file: UploadFile = File(...),
) -> ProfilePictureResponse:
    user, node = container.profiles.update_picture(user, to_incoming_file(file))
    return ProfilePictureResponse(user=UserOut.of(user), node=node)


@router.post("/like", response_model=LikeResponse)
def toggle_like(body: LikeRequest, user: CurrentUser, container: ContainerDep) -> LikeResponse:
    return LikeResponse(message="Success", likes=container.likes.toggle(user, body.music_node_id))
