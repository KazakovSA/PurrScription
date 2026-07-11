from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from api.database import get_db
from api.exceptions import APIError
from api.models import Project, Term, TermStatus, User
from api.schemas import SuccessResponse, TermCreate, TermOut, TermUpdate

router = APIRouter(tags=["terms"])


def serialize(term: Term) -> TermOut:
    return TermOut(
        id=term.id,
        project_id=term.project_id,
        text=term.text,
        translation=term.translation,
        context=term.context,
        status=term.status,
        created_by=term.created_by,
        created_at=term.created_at,
    )


def ensure_editor(user: User) -> None:
    if user.role not in {"admin", "supervisor", "ml_engineer"}:
        raise APIError(403, "AUTHORIZATION_ERROR", "Недостаточно прав для изменения терминов")


@router.get("/projects/{project_id}/terms")
async def list_terms(
    project_id: str, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)
) -> SuccessResponse:
    rows = (
        (await db.execute(select(Term).where(Term.project_id == project_id).order_by(Term.text)))
        .scalars()
        .all()
    )
    return SuccessResponse(data=[serialize(term) for term in rows])


@router.post("/terms", status_code=201)
async def create_term(
    body: TermCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> SuccessResponse:
    ensure_editor(user)
    if (
        await db.execute(select(Project.id).where(Project.id == body.project_id))
    ).scalar_one_or_none() is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Проект не найден")
    if body.status not in {status.value for status in TermStatus}:
        raise APIError(400, "VALIDATION_ERROR", "Некорректный статус")
    term = Term(
        project_id=body.project_id,
        text=body.text.strip(),
        translation=body.translation,
        context=body.context,
        status=body.status,
        created_by=user.id,
    )
    db.add(term)
    await db.flush()
    return SuccessResponse(data=serialize(term))


@router.patch("/terms/{term_id}")
async def update_term(
    term_id: str,
    body: TermUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SuccessResponse:
    ensure_editor(user)
    term = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if term is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Термин не найден")
    values = body.model_dump(exclude_unset=True)
    if "status" in values and values["status"] not in {status.value for status in TermStatus}:
        raise APIError(400, "VALIDATION_ERROR", "Некорректный статус")
    for key, value in values.items():
        setattr(term, key, value.strip() if key == "text" else value)
    await db.flush()
    return SuccessResponse(data=serialize(term))


@router.delete("/terms/{term_id}", status_code=204)
async def delete_term(
    term_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    ensure_editor(user)
    term = (await db.execute(select(Term).where(Term.id == term_id))).scalar_one_or_none()
    if term is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Термин не найден")
    await db.delete(term)
    return Response(status_code=204)
