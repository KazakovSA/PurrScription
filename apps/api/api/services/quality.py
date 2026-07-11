from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.events import event_bus
from api.exceptions import APIError
from api.models import (
    ChecklistItem,
    Comment,
    Marker,
    MarkerSeverity,
    MarkerStatus,
    Segment,
    SegmentLock,
    Task,
    TaskStatus,
)


async def cleanup_expired_locks(db: AsyncSession) -> None:
    now = datetime.now(UTC)
    await db.execute(delete(SegmentLock).where(SegmentLock.expires_at < now))


async def assert_lock_available(
    db: AsyncSession, *, segment_id: str, user_id: str, lock_types: set[str]
) -> None:
    await cleanup_expired_locks(db)
    lock = (
        await db.execute(
            select(SegmentLock).where(
                SegmentLock.segment_id == segment_id,
                SegmentLock.lock_type.in_(lock_types),
                SegmentLock.user_id != user_id,
            )
        )
    ).scalar_one_or_none()
    if lock:
        raise APIError(
            409,
            "LOCK_CONFLICT",
            "Сегмент редактирует другой участник",
            {
                "lockedBy": lock.user_id,
                "lockType": lock.lock_type,
                "expiresAt": lock.expires_at.isoformat(),
            },
        )


async def acquire_lock(
    db: AsyncSession,
    *,
    segment: Segment,
    user_id: str,
    lock_type: str,
    ttl_ms: int | None = None,
) -> SegmentLock:
    settings = get_settings()
    await cleanup_expired_locks(db)
    ttl_seconds = (ttl_ms or settings.lock_ttl_seconds * 1000) // 1000
    expires_at = datetime.now(UTC) + timedelta(seconds=max(ttl_seconds, 30))

    result = await db.execute(
        select(SegmentLock).where(
            and_(SegmentLock.segment_id == segment.id, SegmentLock.lock_type == lock_type)
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.expires_at > datetime.now(UTC) and existing.user_id != user_id:
        raise APIError(
            409,
            "LOCK_CONFLICT",
            "Segment is locked by another user",
            {
                "lockedBy": existing.user_id,
                "expiresAt": existing.expires_at.isoformat(),
            },
        )
    if existing:
        existing.user_id = user_id
        existing.acquired_at = datetime.now(UTC)
        existing.expires_at = expires_at
        lock = existing
    else:
        lock = SegmentLock(
            segment_id=segment.id,
            user_id=user_id,
            lock_type=lock_type,
            expires_at=expires_at,
        )
        db.add(lock)
    await db.flush()
    await event_bus.publish(
        event_type="segment_locked",
        task_id=segment.task_id,
        user_id=user_id,
        data={
            "segmentId": segment.id,
            "userId": user_id,
            "lockType": lock_type,
            "expiresAt": expires_at.isoformat(),
        },
    )
    return lock


async def release_lock(
    db: AsyncSession,
    *,
    segment: Segment,
    user_id: str,
    lock_type: str,
) -> None:
    result = await db.execute(
        select(SegmentLock).where(
            and_(
                SegmentLock.segment_id == segment.id,
                SegmentLock.lock_type == lock_type,
                SegmentLock.user_id == user_id,
            )
        )
    )
    lock = result.scalar_one_or_none()
    if lock:
        await db.delete(lock)
        await db.flush()
        await event_bus.publish(
            event_type="segment_unlocked",
            task_id=segment.task_id,
            user_id=user_id,
            data={"segmentId": segment.id, "lockType": lock_type},
        )


async def run_quality_checks(db: AsyncSession, task: Task) -> dict:
    segments = (
        (
            await db.execute(
                select(Segment).where(Segment.task_id == task.id).order_by(Segment.start_seconds)
            )
        )
        .scalars()
        .all()
    )
    markers = (
        (
            await db.execute(
                select(Marker)
                .join(Segment)
                .where(
                    and_(
                        Segment.task_id == task.id,
                        Marker.status.in_([MarkerStatus.OPEN.value, MarkerStatus.REOPENED.value]),
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    comments = (
        (
            await db.execute(
                select(Comment)
                .join(Segment)
                .where(and_(Segment.task_id == task.id, Comment.resolved.is_(False)))
            )
        )
        .scalars()
        .all()
    )
    checklist = (
        (await db.execute(select(ChecklistItem).where(ChecklistItem.task_id == task.id)))
        .scalars()
        .all()
    )

    blockers: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []
    score = 100.0
    invalid_bounds = 0
    empty_text = 0
    low_confidence = 0
    overlaps = 0

    for segment in segments:
        if segment.end_seconds <= segment.start_seconds:
            invalid_bounds += 1
            blockers.append(f"Сегмент {segment.id}: некорректные границы")
            score -= 5
        if not segment.text.strip():
            empty_text += 1
            warnings.append(f"Сегмент {segment.id}: текст не заполнен")
            score -= 2
        if segment.confidence < 0.5:
            low_confidence += 1
            warnings.append(f"Сегмент {segment.id}: низкая уверенность ASR")
            score -= 1

    latest = segments[0] if segments else None
    for segment in segments[1:]:
        if latest and segment.start_seconds < latest.end_seconds:
            overlaps += 1
            blockers.append(f"Сегменты {latest.id} и {segment.id} пересекаются")
            score -= 5
        if latest is None or segment.end_seconds > latest.end_seconds:
            latest = segment

    critical_markers = [m for m in markers if m.severity == MarkerSeverity.CRITICAL.value]
    if critical_markers:
        blockers.append(f"Критических нерешённых маркеров: {len(critical_markers)}")
        score -= 10 * len(critical_markers)
    if markers:
        warnings.append(f"Нерешённых маркеров: {len(markers)}")
        score -= 0.5 * len(markers)

    if comments:
        warnings.append(f"Нерешённых комментариев: {len(comments)}")
        score -= len(comments)

    incomplete_checklist = [c for c in checklist if c.required and not c.completed]
    if incomplete_checklist:
        blockers.append(
            f"Обязательных незавершённых пунктов чек-листа: {len(incomplete_checklist)}"
        )
        score -= 5 * len(incomplete_checklist)

    accepted = task.status in {TaskStatus.ACCEPTED.value, TaskStatus.EXPORTED.value}
    if not accepted:
        warnings.append("Перед экспортом задача должна быть принята верификатором")

    checks.extend(
        [
            {
                "id": "segment-bounds",
                "check_type": "segment-bounds",
                "severity": "error",
                "message": (
                    "Границы всех сегментов корректны"
                    if invalid_bounds == 0
                    else f"Сегменты с некорректными границами: {invalid_bounds}"
                ),
                "passed": invalid_bounds == 0,
            },
            {
                "id": "segment-overlaps",
                "check_type": "segment-overlaps",
                "severity": "critical",
                "message": (
                    "Сегменты не пересекаются"
                    if overlaps == 0
                    else f"Пересекающиеся пары сегментов: {overlaps}"
                ),
                "passed": overlaps == 0,
            },
            {
                "id": "transcript-completeness",
                "check_type": "transcript-completeness",
                "severity": "warning",
                "message": (
                    "Текст заполнен во всех сегментах"
                    if empty_text == 0
                    else f"Сегменты без текста: {empty_text}"
                ),
                "passed": empty_text == 0,
            },
            {
                "id": "confidence",
                "check_type": "confidence",
                "severity": "warning",
                "message": (
                    "Уверенность распознавания достаточная"
                    if low_confidence == 0
                    else f"Сегменты с низкой уверенностью: {low_confidence}"
                ),
                "passed": low_confidence == 0,
            },
            {
                "id": "open-markers",
                "check_type": "open-markers",
                "severity": "warning",
                "message": f"Нерешённые маркеры: {len(markers)}",
                "passed": len(markers) == 0,
            },
            {
                "id": "open-comments",
                "check_type": "open-comments",
                "severity": "warning",
                "message": f"Нерешённые комментарии: {len(comments)}",
                "passed": len(comments) == 0,
            },
            {
                "id": "workflow-status",
                "check_type": "workflow-status",
                "severity": "info",
                "message": f"Статус задачи: {task.status}",
                "passed": accepted,
            },
        ]
    )

    can_export = len(blockers) == 0 and task.status in {
        TaskStatus.ACCEPTED.value,
        TaskStatus.EXPORTED.value,
    }
    return {
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "score": max(score, 0.0),
        "can_export": can_export,
        "task_status": task.status,
    }
