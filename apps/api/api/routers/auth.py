from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import FileResponse
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
from api.rbac import can_manage_users, user_capabilities
from api.schemas import (
    AvatarUpdate,
    LoginRequest,
    ProfileUpdate,
    RefreshRequest,
    RegisterRequest,
    RoleUpdate,
    SuccessResponse,
    TokenResponse,
)
from api.serializers import user_to_schema

router = APIRouter(prefix="/auth", tags=["auth"])
# Served without the /auth prefix so avatar_url ("/avatars/{id}") resolves directly.
assets_router = APIRouter(tags=["auth"])
settings = get_settings()
AVATAR_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


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


@router.get("/me/capabilities")
async def my_capabilities(current_user: User = Depends(get_current_user)) -> SuccessResponse:
    return SuccessResponse(data=user_capabilities(current_user))


@router.patch("/me")
async def update_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    current_user.name = body.name.strip()
    await db.flush()
    return SuccessResponse(data=user_to_schema(current_user))


@router.patch("/me/avatar")
async def update_avatar(
    body: AvatarUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not body.avatar_url.startswith("data:image/"):
        raise APIError(400, "VALIDATION_ERROR", "Avatar must be an image")
    current_user.avatar_url = body.avatar_url
    await db.flush()
    return SuccessResponse(data=user_to_schema(current_user))


@router.post("/me/avatar-file")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    extension = AVATAR_TYPES.get(file.content_type or "")
    if not extension:
        raise APIError(400, "VALIDATION_ERROR", "Поддерживаются PNG, JPEG и WebP")
    content = await file.read(2_000_001)
    if not content or len(content) > 2_000_000:
        raise APIError(413, "VALIDATION_ERROR", "Аватар должен быть не больше 2 МБ")
    directory = Path(settings.media_storage_path) / "avatars"
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob(f"{current_user.id}.*"):
        old.unlink(missing_ok=True)
    path = directory / f"{current_user.id}{extension}"
    path.write_bytes(content)
    current_user.avatar_url = f"/avatars/{current_user.id}"
    await db.flush()
    return SuccessResponse(data=user_to_schema(current_user))


@assets_router.get("/avatars/{user_id}")
async def avatar(user_id: str) -> FileResponse:
    directory = Path(settings.media_storage_path) / "avatars"
    matches = list(directory.glob(f"{user_id}.*"))
    if not matches:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Аватар не найден")
    return FileResponse(matches[0], headers={"Cache-Control": "public, max-age=3600"})


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_manage_users(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Only admins can manage users")
    users = (await db.execute(select(User).order_by(User.name))).scalars().all()
    return SuccessResponse(data=[user_to_schema(user) for user in users])


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_manage_users(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Only admins can manage users")
    valid_roles = {role.value for role in UserRole}
    if body.role not in valid_roles:
        raise APIError(400, "VALIDATION_ERROR", "Invalid role")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "User not found")
    if user.id == current_user.id and body.role != UserRole.ADMIN.value:
        raise APIError(409, "CONFLICT", "You cannot remove your own admin role")
    user.role = body.role
    await db.flush()
    await write_audit(
        db,
        action="user_role_updated",
        entity_type="user",
        entity_id=user.id,
        user_id=current_user.id,
        details={"role": body.role},
    )
    return SuccessResponse(data=user_to_schema(user))


@router.post("/logout", status_code=204)
async def logout(_current_user: User = Depends(get_current_user)) -> Response:
    return Response(status_code=204)
