from fastapi import APIRouter, status

from app.api.dependencies import ContainerDep
from app.api.schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, container: ContainerDep) -> AuthResponse:
    result = container.auth.register(
        email=body.email,
        username=body.username,
        password=body.password,
        real_name=body.real_name,
        description=body.description,
    )
    return AuthResponse(
        message="User registered successfully",
        token=result.token,
        user=UserOut.of(result.user),
        node=result.node,
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, container: ContainerDep) -> AuthResponse:
    result = container.auth.login(body.username, body.password)
    return AuthResponse(message="Logged in", token=result.token, user=UserOut.of(result.user), node=result.node)
