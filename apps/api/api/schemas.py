from datetime import UTC, datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


def to_camel(string: str) -> str:
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Meta(APIModel):
    version: str = "1.0.0"
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class SuccessResponse(APIModel, Generic[T]):
    data: T
    meta: Meta = Field(default_factory=Meta)


class Pagination(APIModel):
    limit: int
    offset: int
    total: int
    has_more: bool


class PaginatedResponse(APIModel, Generic[T]):
    data: list[T]
    pagination: Pagination


class UserOut(APIModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime
    updated_at: datetime


class RegisterRequest(APIModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    role: str = "annotator"


class LoginRequest(APIModel):
    email: EmailStr
    password: str


class TokenResponse(APIModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut


class RefreshRequest(APIModel):
    refresh_token: str


class ProjectCreate(APIModel):
    name: str
    description: str | None = None


class ProjectOut(APIModel):
    id: str
    name: str
    description: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class TaskCreate(APIModel):
    project_id: str
    name: str
    media_file_id: str
    assigned_to: str | None = None


class TaskUpdate(APIModel):
    status: str | None = None
    assigned_to: str | None = None


class TaskOut(APIModel):
    id: str
    project_id: str
    name: str
    status: str
    media_file_id: str
    assigned_to: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class MediaFileOut(APIModel):
    id: str
    project_id: str
    name: str
    mime_type: str
    duration: float
    sampling_rate: int
    channels: int
    file_size: int
    uploaded_by: str
    uploaded_at: datetime
    url: str


class SegmentCreate(APIModel):
    task_id: str
    start: float
    end: float
    text: str = ""
    speaker: str | None = None
    confidence: float = 0.0


class SegmentUpdate(APIModel):
    start: float | None = None
    end: float | None = None
    text: str | None = None
    speaker: str | None = None
    version: int


class SegmentOut(APIModel):
    id: str
    task_id: str
    start: float
    end: float
    text: str
    speaker: str | None
    confidence: float
    status: str
    version: int
    updated_at: datetime
    updated_by: str


class LockRequest(APIModel):
    lock_type: str
    ttl: int | None = None


class LockOut(APIModel):
    segment_id: str
    user_id: str
    lock_type: str
    acquired_at: datetime
    expires_at: datetime


class MarkerCreate(APIModel):
    segment_id: str
    type: str
    severity: str
    description: str | None = None


class MarkerResolve(APIModel):
    resolution: str


class MarkerOut(APIModel):
    id: str
    segment_id: str
    type: str
    severity: str
    status: str
    description: str | None = None
    created_by: str
    created_at: datetime
    resolved_by: str | None = None
    resolved_at: datetime | None = None
    resolution: str | None = None


class CommentCreate(APIModel):
    segment_id: str
    text: str


class CommentOut(APIModel):
    id: str
    segment_id: str
    text: str
    author: str
    created_at: datetime
    updated_at: datetime
    resolved: bool


class VerifyRequest(APIModel):
    result: str
    comment: str | None = None


class VerificationOut(APIModel):
    id: str
    task_id: str
    verified_by: str
    result: str
    comment: str | None = None
    verified_at: datetime


class QualityCheckOut(APIModel):
    id: str
    check_type: str
    severity: str
    message: str
    passed: bool


class QualityReport(APIModel):
    checks: list[QualityCheckOut]
    task_status: str
    can_export: bool
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    score: float = 100.0


class ExportPrepare(APIModel):
    format: str = "json"


class ExportPrepareOut(APIModel):
    validation_passed: bool
    blockers: list[str]
    estimated_size: int
    ready_to_export: bool


class ExportOut(APIModel):
    id: str
    task_id: str
    format: str
    url: str
    file_size: int
    checksum: str
    exported_by: str
    exported_at: datetime
    quality_gate_passed: bool


class ASRRunOut(APIModel):
    id: str
    task_id: str
    model: str
    version: str
    device: str
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    error: str | None = None


class HealthOut(APIModel):
    status: str
    timestamp: str
    services: dict[str, str]


class WSEnvelope(APIModel):
    type: str
    timestamp: str
    task_id: str
    user_id: str
    data: dict[str, Any]
    event_id: str | None = None
    version: int | None = None
