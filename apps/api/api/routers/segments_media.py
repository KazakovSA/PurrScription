import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import write_audit
from api.auth import get_current_user, get_current_user_flexible
from api.config import get_settings
from api.database import get_db
from api.events import event_bus
from api.exceptions import APIError
from api.models import (
    MediaFile,
    Project,
    Segment,
    SegmentLock,
    SegmentRevision,
    SegmentStatus,
    Task,
    TaskAssignment,
    User,
    UserRole,
)
from api.rbac import can_edit_task, can_manage_projects, can_view_task
from api.schemas import (
    LockOut,
    LockRequest,
    PaginatedResponse,
    Pagination,
    SegmentCreate,
    SegmentOut,
    SegmentSplit,
    SegmentUpdate,
    SuccessResponse,
)
from api.serializers import segment_to_schema
from api.services.gecko import import_gecko_segments, parse_gecko_json
from api.services.quality import (
    acquire_lock,
    assert_lock_available,
    cleanup_expired_locks,
    release_lock,
)

router = APIRouter(tags=["segments", "media"])
settings = get_settings()
ALLOWED_MIME = {"audio/wav", "audio/mpeg", "audio/mp4", "video/mp4", "audio/x-wav", "audio/wave"}


@router.get("/tasks/{task_id}/segments")
async def list_segments(
    task_id: str,
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[SegmentOut]:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied")
    query = select(Segment).where(Segment.task_id == task_id)
    # Annotators with a ranged assignment only see segments overlapping their
    # window. Whole segments are returned, so a segment crossing the boundary is
    # fully included and the effective window grows to absorb it.
    if current_user.role == UserRole.ANNOTATOR.value:
        assignments = (
            (
                await db.execute(
                    select(TaskAssignment).where(
                        TaskAssignment.task_id == task_id,
                        TaskAssignment.user_id == current_user.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        ranged = [
            item
            for item in assignments
            if item.start_seconds is not None or item.end_seconds is not None
        ]
        if ranged:
            window_clauses = []
            for item in ranged:
                conds = []
                if item.end_seconds is not None:
                    conds.append(Segment.start_seconds < item.end_seconds)
                if item.start_seconds is not None:
                    conds.append(Segment.end_seconds > item.start_seconds)
                if conds:
                    window_clauses.append(and_(*conds))
            if window_clauses:
                query = query.where(or_(*window_clauses))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (await db.execute(query.order_by(Segment.start_seconds).offset(offset).limit(limit)))
        .scalars()
        .all()
    )
    return PaginatedResponse(
        data=[segment_to_schema(s) for s in rows],
        pagination=Pagination(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


@router.post("/segments", status_code=201)
async def create_segment(
    body: SegmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == body.task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_edit_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot edit task")
    _validate_segment_bounds(body.start, body.end)
    await _validate_no_overlap(db, body.task_id, body.start, body.end)
    segment = Segment(
        task_id=body.task_id,
        start_seconds=round(body.start, 2),
        end_seconds=round(body.end, 2),
        text=body.text,
        speaker=body.speaker,
        confidence=body.confidence,
        status=SegmentStatus.ANNOTATED.value,
        updated_by=current_user.id,
    )
    db.add(segment)
    await db.flush()
    await _create_revision(db, segment, current_user.id)
    await event_bus.publish(
        event_type="segment_updated",
        task_id=task.id,
        user_id=current_user.id,
        data={"segment": segment_to_schema(segment).model_dump(by_alias=True, mode="json")},
        version=segment.version,
    )
    return SuccessResponse(data=segment_to_schema(segment))


@router.patch("/segments/{segment_id}")
async def update_segment(
    segment_id: str,
    body: SegmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    segment = (
        await db.execute(select(Segment).where(Segment.id == segment_id))
    ).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    task = (await db.execute(select(Task).where(Task.id == segment.task_id))).scalar_one_or_none()
    if task is None or not can_edit_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot edit segment")
    requested_locks = set()
    if body.text is not None or body.speaker is not None:
        requested_locks.add("text")
    if body.start is not None or body.end is not None:
        requested_locks.add("boundaries")
    if requested_locks:
        await assert_lock_available(
            db, segment_id=segment.id, user_id=current_user.id, lock_types=requested_locks
        )

    if body.version != segment.version:
        raise APIError(
            409,
            "VERSION_MISMATCH",
            "Segment version mismatch - optimistic concurrency conflict",
            {
                "expected": segment.version,
                "received": body.version,
                "currentSegment": segment_to_schema(segment).model_dump(by_alias=True, mode="json"),
            },
        )

    if body.start is not None or body.end is not None:
        old_start = segment.start_seconds
        old_end = segment.end_seconds
        start = body.start if body.start is not None else segment.start_seconds
        end = body.end if body.end is not None else segment.end_seconds
        _validate_segment_bounds(start, end)
        await _validate_no_overlap(db, segment.task_id, start, end, exclude_id=segment.id)
        segment.start_seconds = round(start, 2)
        segment.end_seconds = round(end, 2)
        if segment.word_timings and old_end > old_start:
            scale = (end - start) / (old_end - old_start)
            adjusted_words = [dict(word) for word in segment.word_timings]
            for word in adjusted_words:
                for key in ("start", "end", "startTime", "endTime"):
                    if isinstance(word.get(key), (int, float)):
                        word[key] = round(start + (float(word[key]) - old_start) * scale, 3)
            segment.word_timings = adjusted_words
    if body.text is not None:
        if body.text != segment.text:
            segment.word_timings = None
        segment.text = body.text
    if body.speaker is not None:
        segment.speaker = body.speaker

    segment.version += 1
    segment.updated_by = current_user.id
    await db.flush()
    await _create_revision(db, segment, current_user.id)
    await write_audit(
        db,
        action="segment_updated",
        entity_type="segment",
        entity_id=segment.id,
        user_id=current_user.id,
    )
    await event_bus.publish(
        event_type="segment_updated",
        task_id=segment.task_id,
        user_id=current_user.id,
        data={"segment": segment_to_schema(segment).model_dump(by_alias=True, mode="json")},
        version=segment.version,
    )
    return SuccessResponse(data=segment_to_schema(segment))


@router.delete("/segments/{segment_id}", status_code=204)
async def delete_segment(
    segment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    segment = (
        await db.execute(select(Segment).where(Segment.id == segment_id))
    ).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    task = (await db.execute(select(Task).where(Task.id == segment.task_id))).scalar_one_or_none()
    if task is None or not can_edit_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot delete segment")
    task_id = segment.task_id
    await db.delete(segment)
    await db.flush()
    await write_audit(
        db,
        action="segment_deleted",
        entity_type="segment",
        entity_id=segment_id,
        user_id=current_user.id,
    )
    await event_bus.publish(
        event_type="segment_deleted",
        task_id=task_id,
        user_id=current_user.id,
        data={"segmentId": segment_id},
    )


@router.post("/segments/{segment_id}/split")
async def split_segment(
    segment_id: str,
    body: SegmentSplit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    segment = (
        await db.execute(select(Segment).where(Segment.id == segment_id))
    ).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    task = (await db.execute(select(Task).where(Task.id == segment.task_id))).scalar_one_or_none()
    if task is None or not can_edit_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot split segment")
    if body.version != segment.version:
        raise APIError(409, "VERSION_MISMATCH", "Segment version mismatch")
    if body.at - segment.start_seconds < 0.1 or segment.end_seconds - body.at < 0.1:
        raise APIError(400, "VALIDATION_ERROR", "Split point is too close to a segment edge")

    old_end = segment.end_seconds
    segment.end_seconds = round(body.at, 2)
    segment.version += 1
    segment.updated_by = current_user.id
    second = Segment(
        task_id=segment.task_id,
        start_seconds=round(body.at, 2),
        end_seconds=old_end,
        text=segment.text,
        speaker=segment.speaker,
        confidence=segment.confidence,
        status=segment.status,
        updated_by=current_user.id,
    )
    db.add(second)
    await db.flush()
    await _create_revision(db, segment, current_user.id)
    await _create_revision(db, second, current_user.id)
    first_data = segment_to_schema(segment).model_dump(by_alias=True, mode="json")
    second_data = segment_to_schema(second).model_dump(by_alias=True, mode="json")
    for value in (first_data, second_data):
        await event_bus.publish(
            event_type="segment_updated",
            task_id=segment.task_id,
            user_id=current_user.id,
            data={"segment": value},
            version=value["version"],
        )
    return SuccessResponse(data={"first": first_data, "second": second_data})


@router.post("/segments/{segment_id}/lock")
async def lock_segment(
    segment_id: str,
    body: LockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    segment = (
        await db.execute(select(Segment).where(Segment.id == segment_id))
    ).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    lock = await acquire_lock(
        db,
        segment=segment,
        user_id=current_user.id,
        lock_type=body.lock_type,
        ttl_ms=body.ttl,
    )
    return SuccessResponse(
        data=LockOut(
            segment_id=lock.segment_id,
            user_id=lock.user_id,
            lock_type=lock.lock_type,
            acquired_at=lock.acquired_at,
            expires_at=lock.expires_at,
        )
    )


@router.get("/tasks/{task_id}/locks")
async def list_task_locks(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None or not can_view_task(current_user, task):
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    await cleanup_expired_locks(db)
    locks = (
        (
            await db.execute(
                select(SegmentLock)
                .join(Segment, Segment.id == SegmentLock.segment_id)
                .where(Segment.task_id == task_id)
            )
        )
        .scalars()
        .all()
    )
    return SuccessResponse(
        data=[
            {
                "segmentId": lock.segment_id,
                "userId": lock.user_id,
                "lockType": lock.lock_type,
                "expiresAt": lock.expires_at.isoformat(),
            }
            for lock in locks
        ]
    )


@router.post("/segments/{segment_id}/unlock", status_code=204)
async def unlock_segment(
    segment_id: str,
    body: LockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    segment = (
        await db.execute(select(Segment).where(Segment.id == segment_id))
    ).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    await release_lock(db, segment=segment, user_id=current_user.id, lock_type=body.lock_type)


@router.post("/media/upload", status_code=201)
async def upload_media(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    from api.serializers import media_to_schema

    if not can_manage_projects(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot upload media")
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Project not found")
    mime = (
        file.content_type
        or mimetypes.guess_type(file.filename or "")[0]
        or "application/octet-stream"
    )
    if mime not in ALLOWED_MIME:
        raise APIError(400, "VALIDATION_ERROR", f"Unsupported MIME type: {mime}")

    safe_name = Path(file.filename or "upload").name
    storage_dir = Path(settings.media_storage_path)
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_key = f"{project_id}/{uuid.uuid4()}-{safe_name}"
    path = storage_dir / storage_key
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise APIError(413, "VALIDATION_ERROR", "File too large")
                target.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if size == 0:
        path.unlink(missing_ok=True)
        raise APIError(400, "VALIDATION_ERROR", "File is empty")

    media = MediaFile(
        project_id=project_id,
        name=safe_name,
        mime_type=mime,
        duration=60.0,
        sampling_rate=16000,
        channels=1,
        file_size=size,
        storage_key=storage_key,
        uploaded_by=current_user.id,
    )
    db.add(media)
    await db.flush()
    await db.refresh(media)
    await db.commit()
    return SuccessResponse(data=media_to_schema(media))


@router.post("/media/import-gecko", status_code=201)
async def import_gecko(
    project_id: str = Form(...),
    media_file_id: str = Form(...),
    gecko_json: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    import json

    from api.serializers import media_to_schema

    media = (
        await db.execute(select(MediaFile).where(MediaFile.id == media_file_id))
    ).scalar_one_or_none()
    if media is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Media file not found")
    if media.project_id != project_id:
        raise APIError(400, "VALIDATION_ERROR", "Media file belongs to another project")
    if not can_manage_projects(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot import media")
    payload = json.loads((await gecko_json.read()).decode("utf-8-sig"))
    parsed = parse_gecko_json(payload)
    if not parsed:
        hint = ""
        if isinstance(payload, dict):
            hint = f" Found keys: {', '.join(sorted(payload.keys())[:12])}."
        elif isinstance(payload, list):
            hint = f" Root is an array with {len(payload)} items."
        raise APIError(
            400,
            "VALIDATION_ERROR",
            "Gecko JSON does not contain recognizable segments."
            " Expected monologues (Gecko 2.x), tiers, segments, utterances, or annotations." + hint,
        )
    task = Task(
        project_id=project_id,
        name=f"Imported {media.name}",
        media_file_id=media_file_id,
        created_by=current_user.id,
        status="new",
    )
    db.add(task)
    await db.flush()
    segments = await import_gecko_segments(
        db, task_id=task.id, gecko_data=payload, user_id=current_user.id
    )
    return SuccessResponse(
        data={
            "mediaFile": media_to_schema(media).model_dump(by_alias=True, mode="json"),
            "segmentsCreated": len(segments),
            "segments": [
                segment_to_schema(s).model_dump(by_alias=True, mode="json") for s in segments
            ],
            "taskId": task.id,
        }
    )


@router.get("/media/{media_id}")
async def get_media_file(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user_flexible),
) -> FileResponse:
    media = (
        await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    ).scalar_one_or_none()
    if media is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Media not found")
    path = Path(settings.media_storage_path) / media.storage_key
    if not path.exists():
        raise APIError(404, "RESOURCE_NOT_FOUND", "Media file missing on disk")
    return FileResponse(path, media_type=media.mime_type, filename=media.name)


def _validate_segment_bounds(start: float, end: float) -> None:
    if start < 0:
        raise APIError(400, "VALIDATION_ERROR", "start must be >= 0")
    if end <= start:
        raise APIError(400, "VALIDATION_ERROR", "end must be greater than start")


async def _validate_no_overlap(
    db: AsyncSession,
    task_id: str,
    start: float,
    end: float,
    *,
    exclude_id: str | None = None,
) -> None:
    query = select(Segment.id).where(
        Segment.task_id == task_id,
        Segment.start_seconds < end,
        Segment.end_seconds > start,
    )
    if exclude_id:
        query = query.where(Segment.id != exclude_id)
    conflict = (await db.execute(query.limit(1))).scalar_one_or_none()
    if conflict:
        raise APIError(
            409,
            "SEGMENT_OVERLAP",
            "Segment overlaps an existing segment",
            {"conflictingSegmentId": conflict},
        )


async def _create_revision(db: AsyncSession, segment: Segment, user_id: str) -> None:
    revision = SegmentRevision(
        segment_id=segment.id,
        version=segment.version,
        text=segment.text,
        speaker=segment.speaker,
        start_seconds=segment.start_seconds,
        end_seconds=segment.end_seconds,
        confidence=segment.confidence,
        changed_by=user_id,
    )
    db.add(revision)
