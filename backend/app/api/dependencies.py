"""FastAPI dependency providers (thin glue between HTTP and the container)."""
from typing import Annotated

from fastapi import Depends, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.container import Container
from app.domain.entities import IncomingFile, User
from app.domain.exceptions import AuthenticationError

_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]


def get_current_user(
    container: ContainerDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Missing access token")
    return container.auth.authenticate(credentials.credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]


def to_incoming_file(upload: UploadFile) -> IncomingFile:
    return IncomingFile(
        stream=upload.file,
        filename=upload.filename or "file",
        content_type=upload.content_type or "",
        size=upload.size,
    )
