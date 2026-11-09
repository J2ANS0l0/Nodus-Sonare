from fastapi import APIRouter, File, UploadFile

from app.api.dependencies import ContainerDep, CurrentUser, to_incoming_file
from app.api.schemas import LikeRequest, LikeResponse, MeResponse, NodeResponse, ProfileUpdateRequest, UserOut

router = APIRouter(prefix="/api", tags=["profile"])


@router.post("/profile/update", response_model=NodeResponse)
def update_profile(body: ProfileUpdateRequest, user: CurrentUser, container: ContainerDep) -> NodeResponse:
    node = container.profiles.update_profile(user, body.node_id, body.model_dump(exclude={"node_id"}))
    return NodeResponse(message="Success", node=node)


@router.post("/profile/picture", response_model=MeResponse)
def update_profile_picture(
    user: CurrentUser,
    container: ContainerDep,
    file: UploadFile = File(...),
) -> MeResponse:
    user, node = container.profiles.update_picture(user, to_incoming_file(file))
    return MeResponse(user=UserOut.of(user), node=node)


@router.post("/like", response_model=LikeResponse)
def toggle_like(body: LikeRequest, user: CurrentUser, container: ContainerDep) -> LikeResponse:
    return LikeResponse(message="Success", likes=container.likes.toggle(user, body.music_node_id))
