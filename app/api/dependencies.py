import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import CredentialsException, ForbiddenException
from app.core.security import decode_token
from app.storage import user_repo
from app.storage.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise CredentialsException()
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise CredentialsException()
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise CredentialsException()

    user = user_repo.get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise CredentialsException("User not found or inactive")
    return user


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    return get_current_user(credentials, db)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise ForbiddenException()
    return current_user


def require_agent_or_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.agent, UserRole.admin):
        raise ForbiddenException()
    return current_user
