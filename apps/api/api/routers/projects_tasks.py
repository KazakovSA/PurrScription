from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import write_audit
from api.auth import get_current_user
from api.database import get_db
from api.events import event_bus
from api.exceptions import APIError
from api.models import (
    MediaFile,
    Project,
    ProjectMember,
    Task,
    TaskAssignment,
    TaskStatus,
    User,
    UserRole,
)
from api.rbac import (
    _ranges_overlap,
    can_assign_tasks,
    can_edit_task,
    can_manage_projects,
    can_verify_task,
    can_view_task,
)
from api.schemas import (
    PaginatedResponse,
    Pagination,
    ProjectCreate,
    ProjectOut,
    SuccessResponse,
    TaskAssignmentCreate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    VerificationOut,
    VerifyRequest,
)
from api.serializers import assignment_to_schema, task_to_schema
from api.state_machine import validate_transition

router = APIRouter(tags=["projects", "tasks"])


@router.get("/projects")
async def list_projects(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[ProjectOut]:
    total = (await db.execute(select(func.count()).select_from(Project))).scalar_one()
    rows = (
        (
            await db.execute(
                select(Project).order_by(Project.created_at.desc()).offset(offset).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return PaginatedResponse(
        data=[
            ProjectOut(
                id=p.id,
                name=p.name,
                description=p.description,
                created_by=p.created_by,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in rows
        ],
        pagination=Pagination(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


@router.post("/projects", status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_manage_projects(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Insufficient permissions")
    project = Project(name=body.name, description=body.description, created_by=current_user.id)
    db.add(project)
    await db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role=current_user.role))
    await write_audit(
        db,
        action="project_created",
        entity_type="project",
        entity_id=project.id,
        user_id=current_user.id,
    )
    return SuccessResponse(
        data=ProjectOut(
            id=project.id,
            name=project.name,
            description=project.description,
            created_by=project.created_by,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
    )


@router.get("/tasks")
async def list_tasks(
    project_id: str | None = None,
    status: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[TaskOut]:
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == project_id)
    if status:
        query = query.where(Task.status == status)
    if current_user.role == UserRole.ANNOTATOR.value:
        query = query.where(Task.assigned_to == current_user.id)
    elif current_user.role == UserRole.CUSTOMER.value:
        query = query.where(Task.status.in_([TaskStatus.ACCEPTED.value, TaskStatus.EXPORTED.value]))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (await db.execute(query.order_by(Task.created_at.desc()).offset(offset).limit(limit)))
        .scalars()
        .all()
    )
    return PaginatedResponse(
        data=[task_to_schema(t) for t in rows],
        pagination=Pagination(
            limit=limit, offset=offset, total=total, has_more=offset + limit < total
        ),
    )


@router.post("/tasks", status_code=201)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_assign_tasks(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Insufficient permissions")
    project = (
        await db.execute(select(Project).where(Project.id == body.project_id))
    ).scalar_one_or_none()
    if project is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Project not found")
    media = (
        await db.execute(select(MediaFile).where(MediaFile.id == body.media_file_id))
    ).scalar_one_or_none()
    if media is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Media file not found")
    if media.project_id != body.project_id:
        raise APIError(400, "VALIDATION_ERROR", "Media file belongs to another project")
    if body.assigned_to:
        assignee = (
            await db.execute(select(User).where(User.id == body.assigned_to))
        ).scalar_one_or_none()
        if assignee is None:
            raise APIError(404, "RESOURCE_NOT_FOUND", "Assignee not found")
    status = TaskStatus.ASSIGNED.value if body.assigned_to else TaskStatus.NEW.value
    task = Task(
        project_id=body.project_id,
        name=body.name,
        media_file_id=body.media_file_id,
        assigned_to=body.assigned_to,
        created_by=current_user.id,
        status=status,
    )
    db.add(task)
    await db.flush()
    if body.assigned_to:
        db.add(
            TaskAssignment(
                task_id=task.id,
                user_id=body.assigned_to,
                assigned_by=current_user.id,
            )
        )
    await write_audit(
        db, action="task_created", entity_type="task", entity_id=task.id, user_id=current_user.id
    )
    return SuccessResponse(data=task_to_schema(task))


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied to task")
    return SuccessResponse(data=task_to_schema(task))


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_edit_task(current_user, task) and not can_assign_tasks(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot update task")
    old_status = task.status
    if body.status:
        validate_transition(task.status, body.status)
        task.status = body.status
        if body.status == TaskStatus.ACCEPTED.value:
            task.completed_at = datetime.now(UTC)
    if body.assigned_to is not None:
        if not can_assign_tasks(current_user):
            raise APIError(403, "AUTHORIZATION_ERROR", "Cannot assign task")
        task.assigned_to = body.assigned_to
        if task.status == TaskStatus.NEW.value:
            task.status = TaskStatus.ASSIGNED.value
        if body.assigned_to:
            db.add(
                TaskAssignment(
                    task_id=task.id,
                    user_id=body.assigned_to,
                    assigned_by=current_user.id,
                )
            )
    await db.flush()
    if body.status and body.status != old_status:
        await write_audit(
            db,
            action="task_status_changed",
            entity_type="task",
            entity_id=task.id,
            user_id=current_user.id,
            details={"from": old_status, "to": task.status},
        )
        await event_bus.publish(
            event_type="task_status_changed",
            task_id=task.id,
            user_id=current_user.id,
            data={"taskId": task.id, "from": old_status, "to": task.status},
        )
    return SuccessResponse(data=task_to_schema(task))


@router.get("/tasks/{task_id}/verification")
async def get_verification(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    from api.models import VerificationResult

    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied")
    result = (
        await db.execute(
            select(VerificationResult)
            .where(VerificationResult.task_id == task_id)
            .order_by(VerificationResult.verified_at.desc())
        )
    ).scalar_one_or_none()
    if result is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No verification result")
    return SuccessResponse(
        data=VerificationOut(
            id=result.id,
            task_id=result.task_id,
            verified_by=result.verified_by,
            result=result.result,
            comment=result.comment,
            verified_at=result.verified_at,
        )
    )


@router.post("/tasks/{task_id}/verify", status_code=201)
async def verify_task(
    task_id: str,
    body: VerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    from api.models import VerificationOutcome, VerificationResult

    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_verify_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot verify this task")
    if body.result == VerificationOutcome.ACCEPTED.value and task.assigned_to == current_user.id:
        raise APIError(403, "AUTHORIZATION_ERROR", "Annotator cannot accept own task")

    target_status = {
        VerificationOutcome.ACCEPTED.value: TaskStatus.ACCEPTED.value,
        VerificationOutcome.REWORK.value: TaskStatus.REWORK.value,
        VerificationOutcome.REJECTED.value: TaskStatus.REWORK.value,
    }[body.result]
    validate_transition(task.status, target_status)
    old_status = task.status
    task.status = target_status
    if target_status == TaskStatus.ACCEPTED.value:
        task.completed_at = datetime.now(UTC)

    vr = VerificationResult(
        task_id=task.id,
        verified_by=current_user.id,
        result=body.result,
        comment=body.comment,
    )
    db.add(vr)
    await db.flush()
    await write_audit(
        db,
        action="task_verified",
        entity_type="task",
        entity_id=task.id,
        user_id=current_user.id,
        details={"result": body.result},
    )
    await event_bus.publish(
        event_type="task_status_changed",
        task_id=task.id,
        user_id=current_user.id,
        data={
            "taskId": task.id,
            "from": old_status,
            "to": task.status,
            "verification": body.result,
        },
    )
    return SuccessResponse(
        data=VerificationOut(
            id=vr.id,
            task_id=vr.task_id,
            verified_by=vr.verified_by,
            result=vr.result,
            comment=vr.comment,
            verified_at=vr.verified_at,
        )
    )


@router.get("/tasks/{task_id}/assignments")
async def list_task_assignments(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied")
    rows = (
        await db.execute(
            select(TaskAssignment, User)
            .join(User, TaskAssignment.user_id == User.id)
            .where(TaskAssignment.task_id == task_id)
            .order_by(TaskAssignment.assigned_at.desc())
        )
    ).all()
    return SuccessResponse(
        data=[assignment_to_schema(assignment, user) for assignment, user in rows]
    )


@router.post("/tasks/{task_id}/assignments", status_code=201)
async def create_task_assignment(
    task_id: str,
    body: TaskAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_assign_tasks(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot assign task")
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    assignee = (
        await db.execute(select(User).where(User.id == body.user_id))
    ).scalar_one_or_none()
    if assignee is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Assignee not found")
    if (
        body.start_seconds is not None
        and body.end_seconds is not None
        and body.start_seconds >= body.end_seconds
    ):
        raise APIError(400, "VALIDATION_ERROR", "start_seconds must be less than end_seconds")

    existing = (
        (
            await db.execute(
                select(TaskAssignment).where(TaskAssignment.task_id == task_id)
            )
        )
        .scalars()
        .all()
    )
    for item in existing:
        if _ranges_overlap(
            item.start_seconds,
            item.end_seconds,
            body.start_seconds,
            body.end_seconds,
        ):
            raise APIError(
                409,
                "ASSIGNMENT_OVERLAP",
                "Диапазон пересекается с уже назначенным участком",
            )

    assignment = TaskAssignment(
        task_id=task_id,
        user_id=body.user_id,
        assigned_by=current_user.id,
        start_seconds=body.start_seconds,
        end_seconds=body.end_seconds,
    )
    db.add(assignment)
    if task.assigned_to is None:
        task.assigned_to = body.user_id
        if task.status == TaskStatus.NEW.value:
            task.status = TaskStatus.ASSIGNED.value
    await db.flush()
    await write_audit(
        db,
        action="task_assignment_created",
        entity_type="task",
        entity_id=task.id,
        user_id=current_user.id,
        details={
            "assignee": body.user_id,
            "startSeconds": body.start_seconds,
            "endSeconds": body.end_seconds,
        },
    )
    return SuccessResponse(data=assignment_to_schema(assignment, assignee))


@router.delete("/tasks/{task_id}/assignments/{assignment_id}", status_code=204)
async def delete_task_assignment(
    task_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not can_assign_tasks(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot assign task")
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    assignment = (
        await db.execute(
            select(TaskAssignment).where(
                TaskAssignment.id == assignment_id,
                TaskAssignment.task_id == task_id,
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Assignment not found")
    removed_user = assignment.user_id
    await db.delete(assignment)
    await db.flush()
    remaining = (
        (
            await db.execute(
                select(TaskAssignment).where(TaskAssignment.task_id == task_id)
            )
        )
        .scalars()
        .all()
    )
    if task.assigned_to == removed_user:
        task.assigned_to = remaining[0].user_id if remaining else None
        if task.assigned_to is None and task.status == TaskStatus.ASSIGNED.value:
            task.status = TaskStatus.NEW.value
    await write_audit(
        db,
        action="task_assignment_deleted",
        entity_type="task",
        entity_id=task.id,
        user_id=current_user.id,
        details={"assignment": assignment_id, "assignee": removed_user},
    )

