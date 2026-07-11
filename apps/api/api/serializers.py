from api.models import Comment, Marker, MediaFile, Segment, Task, TaskAssignment, User
from api.schemas import (
    CommentOut,
    MarkerOut,
    MediaFileOut,
    SegmentOut,
    TaskAssignmentOut,
    TaskOut,
    UserOut,
    UserSummary,
)


def user_to_schema(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def user_summary(user: User) -> UserSummary:
    return UserSummary(
        id=user.id,
        name=user.name,
        role=user.role,
        avatar_url=user.avatar_url,
    )


def task_to_schema(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        project_id=task.project_id,
        name=task.name,
        status=task.status,
        media_file_id=task.media_file_id,
        assigned_to=task.assigned_to,
        created_by=task.created_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
    )


def segment_to_schema(segment: Segment) -> SegmentOut:
    return SegmentOut(
        id=segment.id,
        task_id=segment.task_id,
        start=segment.start_seconds,
        end=segment.end_seconds,
        text=segment.text,
        speaker=segment.speaker,
        confidence=segment.confidence,
        word_timings=segment.word_timings,
        status=segment.status,
        version=segment.version,
        updated_at=segment.updated_at,
        updated_by=segment.updated_by,
    )


def media_to_schema(media: MediaFile, base_url: str = "/media") -> MediaFileOut:
    return MediaFileOut(
        id=media.id,
        project_id=media.project_id,
        name=media.name,
        mime_type=media.mime_type,
        duration=media.duration,
        sampling_rate=media.sampling_rate,
        channels=media.channels,
        file_size=media.file_size,
        uploaded_by=media.uploaded_by,
        uploaded_at=media.uploaded_at,
        url=f"{base_url}/{media.id}",
    )


def marker_to_schema(marker: Marker) -> MarkerOut:
    return MarkerOut(
        id=marker.id,
        segment_id=marker.segment_id,
        type=marker.type,
        severity=marker.severity,
        status=marker.status,
        description=marker.description,
        created_by=marker.created_by,
        created_at=marker.created_at,
        resolved_by=marker.resolved_by,
        resolved_at=marker.resolved_at,
        resolution=marker.resolution,
    )


def comment_to_schema(comment: Comment, author: User | None = None) -> CommentOut:
    author_summary = (
        user_summary(author)
        if author is not None
        else UserSummary(id=comment.author, name="Unknown", role="annotator", avatar_url=None)
    )
    return CommentOut(
        id=comment.id,
        segment_id=comment.segment_id,
        text=comment.text,
        author=author_summary,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        resolved=comment.resolved,
        time_seconds=comment.time_seconds,
        time_end_seconds=comment.time_end_seconds,
        color=comment.color,
    )


def assignment_to_schema(assignment: TaskAssignment, user: User) -> TaskAssignmentOut:
    return TaskAssignmentOut(
        id=assignment.id,
        task_id=assignment.task_id,
        user_id=assignment.user_id,
        user_name=user.name,
        user_role=user.role,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
        start_seconds=assignment.start_seconds,
        end_seconds=assignment.end_seconds,
    )
