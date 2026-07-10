from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from api.database import get_db
from api.events import event_bus
from api.exceptions import APIError
from api.models import Comment, Marker, MarkerStatus, Segment, Task, User
from api.rbac import can_view_task
from api.schemas import (
    CommentCreate,
    MarkerCreate,
    MarkerResolve,
    SuccessResponse,
)
from api.serializers import comment_to_schema, marker_to_schema

router = APIRouter(tags=["markers", "comments"])


@router.post("/markers", status_code=201)
async def create_marker(
    body: MarkerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    segment = (await db.execute(select(Segment).where(Segment.id == body.segment_id))).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    task = (await db.execute(select(Task).where(Task.id == segment.task_id))).scalar_one_or_none()
    if task is None or not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied")
    marker = Marker(
        segment_id=body.segment_id,
        type=body.type,
        severity=body.severity,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(marker)
    await db.flush()
    await event_bus.publish(
        event_type="marker_created",
        task_id=segment.task_id,
        user_id=current_user.id,
        data={"marker": marker_to_schema(marker).model_dump(by_alias=True, mode="json")},
    )
    return SuccessResponse(data=marker_to_schema(marker))


@router.post("/markers/{marker_id}/resolve")
async def resolve_marker(
    marker_id: str,
    body: MarkerResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    from datetime import UTC, datetime

    marker = (await db.execute(select(Marker).where(Marker.id == marker_id))).scalar_one_or_none()
    if marker is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Marker not found")
    segment = (await db.execute(select(Segment).where(Segment.id == marker.segment_id))).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    marker.status = MarkerStatus.FIXED.value if current_user.role == "annotator" else MarkerStatus.RESOLVED.value
    marker.resolution = body.resolution
    marker.resolved_by = current_user.id
    marker.resolved_at = datetime.now(UTC)
    await db.flush()
    await event_bus.publish(
        event_type="marker_resolved",
        task_id=segment.task_id,
        user_id=current_user.id,
        data={"markerId": marker.id, "status": marker.status},
    )
    return SuccessResponse(data=marker_to_schema(marker))


@router.post("/comments", status_code=201)
async def create_comment(
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    segment = (await db.execute(select(Segment).where(Segment.id == body.segment_id))).scalar_one_or_none()
    if segment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Segment not found")
    comment = Comment(segment_id=body.segment_id, text=body.text, author=current_user.id)
    db.add(comment)
    await db.flush()
    await event_bus.publish(
        event_type="comment_created",
        task_id=segment.task_id,
        user_id=current_user.id,
        data={"comment": comment_to_schema(comment).model_dump(by_alias=True, mode="json")},
    )
    return SuccessResponse(data=comment_to_schema(comment))


@router.post("/comments/{comment_id}/resolve", status_code=204)
async def resolve_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    comment = (await db.execute(select(Comment).where(Comment.id == comment_id))).scalar_one_or_none()
    if comment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Comment not found")
    comment.resolved = True
    await db.flush()
    segment = (await db.execute(select(Segment).where(Segment.id == comment.segment_id))).scalar_one_or_none()
    if segment:
        await event_bus.publish(
            event_type="comment_resolved",
            task_id=segment.task_id,
            user_id=current_user.id,
            data={"commentId": comment.id},
        )
    return Response(status_code=204)
