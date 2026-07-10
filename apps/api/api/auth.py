from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.exceptions import APIError
from api.models import User

ph = PasswordHasher()
security = HTTPBearer(auto_error=False)
settings = get_settings()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    expire = datetime.now(UTC) + expires_delta
    payload = {"sub": subject, "type": token_type, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    return create_token(
        user_id,
        "access",
        timedelta(hours=settings.jwt_expiration_hours),
    )


def create_refresh_token(user_id: str) -> str:
    return create_token(
        user_id,
        "refresh",
        timedelta(days=settings.jwt_refresh_expiration_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise APIError(401, "AUTHENTICATION_ERROR", "Invalid or expired token") from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise APIError(401, "AUTHENTICATION_ERROR", "Missing authorization token")
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise APIError(401, "AUTHENTICATION_ERROR", "Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise APIError(401, "AUTHENTICATION_ERROR", "Invalid token subject")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise APIError(401, "AUTHENTICATION_ERROR", "User not found")
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except APIError:
        return None
