from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import write_audit
from api.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_optional_user,
    hash_password,
    verify_password,
)
from api.config import get_settings
from api.database import get_db
from api.exceptions import APIError
from api.models import User, UserRole
from api.rbac import can_manage_users
from api.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    SuccessResponse,
    TokenResponse,
)
from api.serializers import user_to_schema

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> SuccessResponse:
    if current_user is not None:
        if not can_manage_users(current_user):
            raise APIError(403, "AUTHORIZATION_ERROR", "Only admins can register users")
    elif not settings.feature_demo_mode:
        raise APIError(401, "AUTHENTICATION_ERROR", "Registration requires admin authentication")

    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise APIError(409, "CONFLICT", "Email already registered")
    valid_roles = {r.value for r in UserRole}
    if body.role not in valid_roles:
        raise APIError(400, "VALIDATION_ERROR", "Invalid role")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.flush()
    if current_user:
        await write_audit(
            db,
            action="user_registered",
            entity_type="user",
            entity_id=user.id,
            user_id=current_user.id,
            details={"email": user.email, "role": user.role},
        )
    return SuccessResponse(data=user_to_schema(user))


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> SuccessResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise APIError(401, "AUTHENTICATION_ERROR", "Invalid email or password")
    token_data = TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.jwt_expiration_hours * 3600,
        user=user_to_schema(user),
    )
    return SuccessResponse(data=token_data)


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> SuccessResponse:
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise APIError(401, "AUTHENTICATION_ERROR", "Invalid refresh token")
    user_id = payload.get("sub")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise APIError(401, "AUTHENTICATION_ERROR", "User not found")
    token_data = TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.jwt_expiration_hours * 3600,
        user=user_to_schema(user),
    )
    return SuccessResponse(data=token_data)


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)) -> SuccessResponse:
    return SuccessResponse(data=user_to_schema(current_user))


@router.post("/logout", status_code=204)
async def logout(_current_user: User = Depends(get_current_user)) -> Response:
    return Response(status_code=204)
