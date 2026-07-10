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
        await db.execute(select(Segment).where(Segment.task_id == task.id).order_by(Segment.start_seconds))
    ).scalars().all()
    markers = (
        await db.execute(
            select(Marker).join(Segment).where(
                and_(Segment.task_id == task.id, Marker.status.in_([MarkerStatus.OPEN.value, MarkerStatus.REOPENED.value]))
            )
        )
    ).scalars().all()
    comments = (
        await db.execute(
            select(Comment).join(Segment).where(and_(Segment.task_id == task.id, Comment.resolved.is_(False)))
        )
    ).scalars().all()
    checklist = (
        await db.execute(select(ChecklistItem).where(ChecklistItem.task_id == task.id))
    ).scalars().all()

    blockers: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []
    score = 100.0

    for segment in segments:
        if segment.end_seconds <= segment.start_seconds:
            blockers.append(f"Segment {segment.id}: invalid time bounds")
            score -= 5
        if not segment.text.strip():
            warnings.append(f"Segment {segment.id}: empty text")
            score -= 2
        if segment.confidence < 0.5:
            warnings.append(f"Segment {segment.id}: low confidence")
            score -= 1

    for i, seg_a in enumerate(segments):
        for seg_b in segments[i + 1 :]:
            if seg_a.start_seconds < seg_b.end_seconds and seg_b.start_seconds < seg_a.end_seconds:
                blockers.append(f"Segments {seg_a.id} and {seg_b.id} overlap")
                score -= 5

    critical_markers = [m for m in markers if m.severity == MarkerSeverity.CRITICAL.value]
    if critical_markers:
        blockers.append(f"{len(critical_markers)} critical markers unresolved")
        score -= 10 * len(critical_markers)

    if comments:
        warnings.append(f"{len(comments)} unresolved comments")
        score -= len(comments)

    incomplete_checklist = [c for c in checklist if c.required and not c.completed]
    if incomplete_checklist:
        blockers.append(f"{len(incomplete_checklist)} checklist items incomplete")
        score -= 5 * len(incomplete_checklist)

    if task.status != TaskStatus.ACCEPTED.value:
        blockers.append("Task not accepted by verifier")

    can_export = len(blockers) == 0
    return {
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "score": max(score, 0.0),
        "can_export": can_export,
        "task_status": task.status,
    }
