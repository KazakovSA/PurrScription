import asyncio

from sqlalchemy import select

from api.auth import hash_password
from api.config import get_settings
from api.database import async_session_factory, init_db
from api.models import (
    ChecklistItem,
    Comment,
    Marker,
    MarkerSeverity,
    MarkerStatus,
    MediaFile,
    Project,
    ProjectMember,
    Segment,
    SegmentStatus,
    Task,
    TaskStatus,
    Term,
    TermStatus,
    User,
    UserRole,
)
from api.services.gecko import load_demo_gecko, parse_gecko_json

DEMO_USERS = [
    ("admin@purrscription.dev", "Admin", UserRole.ADMIN.value),
    ("supervisor@purrscription.dev", "Supervisor", UserRole.SUPERVISOR.value),
    ("annotator@purrscription.dev", "Annotator", UserRole.ANNOTATOR.value),
    ("verifier@purrscription.dev", "Verifier", UserRole.VERIFIER.value),
    ("ml_engineer@purrscription.dev", "ML Engineer", UserRole.ML_ENGINEER.value),
    ("customer@purrscription.dev", "Customer", UserRole.CUSTOMER.value),
]

TERM_SEEDS = ["TATLIN", "VEGMAN", "UNIFIED", "BACKUP", "FLEX", "ARCHIVE"]


async def seed() -> None:
    settings = get_settings()
    await init_db()
    async with async_session_factory() as db:
        existing = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if existing:
            return

        users: dict[str, User] = {}
        for email, name, role in DEMO_USERS:
            user = User(email=email, name=name, role=role, password_hash=hash_password(settings.demo_user_password))
            db.add(user)
            users[role] = user
        await db.flush()

        admin = users[UserRole.ADMIN.value]
        supervisor = users[UserRole.SUPERVISOR.value]
        annotator = users[UserRole.ANNOTATOR.value]
        verifier = users[UserRole.VERIFIER.value]

        project = Project(
            name="Demo Interview Project",
            description="Seed project with overlapping segments and disputed terms",
            created_by=supervisor.id,
        )
        db.add(project)
        await db.flush()
        for user in users.values():
            db.add(ProjectMember(project_id=project.id, user_id=user.id, role=user.role))

        for text in TERM_SEEDS:
            status = TermStatus.APPROVED.value if text in {"TATLIN", "VEGMAN"} else TermStatus.REVIEW.value
            db.add(
                Term(
                    project_id=project.id,
                    text=text,
                    translation=text,
                    context="Demo glossary",
                    status=status,
                    created_by=admin.id,
                )
            )

        media = MediaFile(
            project_id=project.id,
            name="demo-interview-001.wav",
            mime_type="audio/wav",
            duration=120.0,
            sampling_rate=16000,
            channels=1,
            file_size=1024,
            storage_key="demo/demo-interview-001.wav",
            uploaded_by=supervisor.id,
        )
        db.add(media)
        await db.flush()

        gecko = load_demo_gecko()
        parsed = parse_gecko_json(gecko) if gecko else []

        task_work = Task(
            project_id=project.id,
            name="Interview 001 - Annotation",
            media_file_id=media.id,
            assigned_to=annotator.id,
            created_by=supervisor.id,
            status=TaskStatus.IN_PROGRESS.value,
        )
        task_accepted = Task(
            project_id=project.id,
            name="Interview 002 - Accepted",
            media_file_id=media.id,
            assigned_to=annotator.id,
            created_by=supervisor.id,
            status=TaskStatus.ACCEPTED.value,
        )
        db.add_all([task_work, task_accepted])
        await db.flush()

        segments_data = parsed[:12] if parsed else [
            {"start": 0.0, "end": 4.0, "text": "TATLIN unified storage", "speaker": "TATLIN", "confidence": 0.91},
            {"start": 3.5, "end": 8.0, "text": "VEGMAN backup flex", "speaker": "VEGMAN", "confidence": 0.42},
            {"start": 8.0, "end": 12.0, "text": "archive configuration", "speaker": "TATLIN", "confidence": 0.88},
            {"start": 12.0, "end": 15.0, "text": "", "speaker": "TATLIN", "confidence": 0.2},
        ]
        created_segments: list[Segment] = []
        for item in segments_data:
            segment = Segment(
                task_id=task_work.id,
                start_seconds=round(float(item["start"]), 2),
                end_seconds=round(float(item["end"]), 2),
                text=item.get("text", ""),
                speaker=item.get("speaker"),
                confidence=float(item.get("confidence", 0.8)),
                status=SegmentStatus.ANNOTATED.value,
                updated_by=annotator.id,
            )
            db.add(segment)
            created_segments.append(segment)
        await db.flush()

        if created_segments:
            db.add(
                Marker(
                    segment_id=created_segments[1].id,
                    type="low-confidence",
                    severity=MarkerSeverity.CRITICAL.value,
                    status=MarkerStatus.OPEN.value,
                    description="ASR confidence below threshold",
                    created_by=verifier.id,
                )
            )
            db.add(
                Comment(
                    segment_id=created_segments[0].id,
                    text="Please verify TATLIN spelling",
                    author=verifier.id,
                )
            )

        for task in (task_work, task_accepted):
            db.add(
                ChecklistItem(
                    task_id=task.id,
                    description="Listened to full audio",
                    required=True,
                    completed=task.status == TaskStatus.ACCEPTED.value,
                    completed_by=annotator.id if task.status == TaskStatus.ACCEPTED.value else None,
                )
            )

        for item in segments_data[:4]:
            db.add(
                Segment(
                    task_id=task_accepted.id,
                    start_seconds=round(float(item["start"]), 2),
                    end_seconds=round(float(item["end"]), 2),
                    text=item.get("text", "verified"),
                    speaker=item.get("speaker"),
                    confidence=0.95,
                    status=SegmentStatus.VERIFIED.value,
                    updated_by=annotator.id,
                )
            )

        await db.commit()


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
