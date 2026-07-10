
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import write_audit
from api.auth import get_current_user
from api.database import get_db
from api.events import event_bus
from api.exceptions import APIError
from api.models import ASRRun, ExportFile, MediaFile, Segment, Task, TaskStatus, User
from api.rbac import can_export, can_view_task
from api.schemas import (
    ASRRunOut,
    ExportOut,
    ExportPrepare,
    ExportPrepareOut,
    QualityReport,
    SuccessResponse,
)
from api.services.asr import gecko_export, start_asr_run, write_export_file
from api.services.quality import run_quality_checks

router = APIRouter(tags=["quality", "export", "asr"])


@router.post("/tasks/{task_id}/quality-check")
async def quality_check(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    if not can_view_task(current_user, task):
        raise APIError(403, "AUTHORIZATION_ERROR", "Access denied")
    report = await run_quality_checks(db, task)
    return SuccessResponse(
        data=QualityReport(
            checks=report["checks"],
            task_status=report["task_status"],
            can_export=report["can_export"],
            blockers=report["blockers"],
            warnings=report["warnings"],
            score=report["score"],
        )
    )


@router.post("/tasks/{task_id}/asr", status_code=202)
async def run_asr(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    media = (await db.execute(select(MediaFile).where(MediaFile.id == task.media_file_id))).scalar_one_or_none()
    if media is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Media not found")
    run = await start_asr_run(db, task_id=task.id, media_duration=media.duration, user_id=current_user.id)
    return SuccessResponse(
        data=ASRRunOut(
            id=run.id,
            task_id=run.task_id,
            model=run.model,
            version=run.version,
            device=run.device,
            status=run.status,
            started_at=run.started_at,
            completed_at=run.completed_at,
            error=run.error,
        )
    )


@router.get("/tasks/{task_id}/asr/{run_id}")
async def get_asr_status(
    task_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    run = (await db.execute(select(ASRRun).where(ASRRun.id == run_id, ASRRun.task_id == task_id))).scalar_one_or_none()
    if run is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "ASR run not found")
    return SuccessResponse(
        data={
            "run": ASRRunOut(
                id=run.id,
                task_id=run.task_id,
                model=run.model,
                version=run.version,
                device=run.device,
                status=run.status,
                started_at=run.started_at,
                completed_at=run.completed_at,
                error=run.error,
            ).model_dump(by_alias=True, mode="json"),
            "rawResult": run.raw_result,
        }
    )


@router.post("/tasks/{task_id}/export/prepare")
async def prepare_export(
    task_id: str,
    body: ExportPrepare,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_export(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot export")
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    report = await run_quality_checks(db, task)
    if not report["can_export"]:
        raise APIError(422, "QUALITY_GATE_FAILED", "Export blocked by quality gate", {"blockers": report["blockers"]})
    segments = (await db.execute(select(Segment).where(Segment.task_id == task_id))).scalars().all()
    estimated = sum(len(s.text) for s in segments) * 4
    return SuccessResponse(
        data=ExportPrepareOut(
            validation_passed=True,
            blockers=[],
            estimated_size=estimated,
            ready_to_export=True,
        )
    )


@router.post("/tasks/{task_id}/export", status_code=201)
async def export_task(
    task_id: str,
    body: ExportPrepare,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SuccessResponse:
    if not can_export(current_user):
        raise APIError(403, "AUTHORIZATION_ERROR", "Cannot export")
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if task is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Task not found")
    report = await run_quality_checks(db, task)
    if not report["can_export"]:
        raise APIError(422, "QUALITY_GATE_FAILED", "Export blocked by quality gate", {"blockers": report["blockers"]})

    media = (await db.execute(select(MediaFile).where(MediaFile.id == task.media_file_id))).scalar_one_or_none()
    segments = (await db.execute(select(Segment).where(Segment.task_id == task_id).order_by(Segment.start_seconds))).scalars().all()
    payload = gecko_export(task_id, segments, media.name if media else "media")
    path, size, checksum = write_export_file(task_id, payload, body.format)

    export = ExportFile(
        task_id=task_id,
        format=body.format,
        storage_key=str(path),
        file_size=size,
        checksum=checksum,
        exported_by=current_user.id,
        quality_gate_passed=True,
    )
    db.add(export)
    old_status = task.status
    if task.status == TaskStatus.ACCEPTED.value:
        task.status = TaskStatus.EXPORTED.value
    await db.flush()
    await write_audit(db, action="task_exported", entity_type="task", entity_id=task.id, user_id=current_user.id)
    await event_bus.publish(
        event_type="task_status_changed",
        task_id=task.id,
        user_id=current_user.id,
        data={"from": old_status, "to": task.status, "exportId": export.id},
    )
    return SuccessResponse(
        data=ExportOut(
            id=export.id,
            task_id=export.task_id,
            format=export.format,
            url=f"/exports/{export.id}",
            file_size=export.file_size,
            checksum=export.checksum,
            exported_by=export.exported_by,
            exported_at=export.exported_at,
            quality_gate_passed=export.quality_gate_passed,
        )
    )
