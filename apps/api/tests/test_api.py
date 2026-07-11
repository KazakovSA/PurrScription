import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.auth import hash_password
from api.database import Base, get_db
from api.main import app
from api.models import User, UserRole

TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(session_factory) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    async with session_factory() as session:
        session.add(
            User(
                email="admin@purrscription.dev",
                name="Admin",
                role=UserRole.ADMIN.value,
                password_hash=hash_password("demo123"),
            )
        )
        session.add(
            User(
                email="annotator@purrscription.dev",
                name="Annotator",
                role=UserRole.ANNOTATOR.value,
                password_hash=hash_password("demo123"),
            )
        )
        session.add(
            User(
                email="verifier@purrscription.dev",
                name="Verifier",
                role=UserRole.VERIFIER.value,
                password_hash=hash_password("demo123"),
            )
        )
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _login(client: AsyncClient, email: str, password: str = "demo123") -> str:
    response = await client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["data"]["accessToken"]


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "healthy"


@pytest.mark.asyncio
async def test_login_and_me(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "admin"


@pytest.mark.asyncio
async def test_task_state_machine_conflict(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    headers = {"Authorization": f"Bearer {token}"}

    project_resp = await client.post(
        "/projects",
        headers=headers,
        json={"name": "Test", "description": "state machine"},
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["data"]["id"]

    media_resp = await client.post(
        "/media/upload",
        headers=headers,
        data={"project_id": project_id},
        files={"file": ("demo.wav", b"RIFF", "audio/wav")},
    )
    assert media_resp.status_code == 201
    media_id = media_resp.json()["data"]["id"]

    task_resp = await client.post(
        "/tasks",
        headers=headers,
        json={
            "projectId": project_id,
            "name": "Task",
            "mediaFileId": media_id,
            "assignedTo": None,
        },
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["data"]["id"]

    bad_transition = await client.patch(
        f"/tasks/{task_id}",
        headers=headers,
        json={"status": "accepted"},
    )
    assert bad_transition.status_code == 409


@pytest.mark.asyncio
async def test_segment_version_conflict(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    headers = {"Authorization": f"Bearer {token}"}

    project_id = (await client.post("/projects", headers=headers, json={"name": "P"})).json()[
        "data"
    ]["id"]
    media_id = (
        await client.post(
            "/media/upload",
            headers=headers,
            data={"project_id": project_id},
            files={"file": ("demo.wav", b"RIFF", "audio/wav")},
        )
    ).json()["data"]["id"]
    task_id = (
        await client.post(
            "/tasks",
            headers=headers,
            json={"projectId": project_id, "name": "T", "mediaFileId": media_id},
        )
    ).json()["data"]["id"]

    seg_resp = await client.post(
        "/segments",
        headers=headers,
        json={"taskId": task_id, "start": 0.0, "end": 2.0, "text": "hello"},
    )
    segment_id = seg_resp.json()["data"]["id"]

    ok = await client.patch(
        f"/segments/{segment_id}",
        headers=headers,
        json={"text": "updated", "version": 1},
    )
    assert ok.status_code == 200

    conflict = await client.patch(
        f"/segments/{segment_id}",
        headers=headers,
        json={"text": "stale", "version": 1},
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "VERSION_MISMATCH"


@pytest.mark.asyncio
async def test_self_accept_forbidden(client: AsyncClient):
    admin_token = await _login(client, "admin@purrscription.dev")
    annotator_token = await _login(client, "annotator@purrscription.dev")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    project_id = (await client.post("/projects", headers=admin_headers, json={"name": "P"})).json()[
        "data"
    ]["id"]
    media_id = (
        await client.post(
            "/media/upload",
            headers=admin_headers,
            data={"project_id": project_id},
            files={"file": ("demo.wav", b"RIFF", "audio/wav")},
        )
    ).json()["data"]["id"]

    users = await client.get("/auth/me", headers={"Authorization": f"Bearer {annotator_token}"})
    annotator_id = users.json()["data"]["id"]

    task_id = (
        await client.post(
            "/tasks",
            headers=admin_headers,
            json={
                "projectId": project_id,
                "name": "Assigned",
                "mediaFileId": media_id,
                "assignedTo": annotator_id,
            },
        )
    ).json()["data"]["id"]

    await client.patch(f"/tasks/{task_id}", headers=admin_headers, json={"status": "in_progress"})
    await client.patch(f"/tasks/{task_id}", headers=admin_headers, json={"status": "review"})

    verifier_token = await _login(client, "verifier@purrscription.dev")
    accept = await client.post(
        f"/tasks/{task_id}/verify",
        headers={"Authorization": f"Bearer {verifier_token}"},
        json={"result": "accepted", "comment": "ok"},
    )
    assert accept.status_code == 201


@pytest.mark.asyncio
async def test_asr_mock_creates_segments(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    headers = {"Authorization": f"Bearer {token}"}
    project_id = (await client.post("/projects", headers=headers, json={"name": "ASR"})).json()[
        "data"
    ]["id"]
    media_id = (
        await client.post(
            "/media/upload",
            headers=headers,
            data={"project_id": project_id},
            files={"file": ("demo.wav", b"RIFF", "audio/wav")},
        )
    ).json()["data"]["id"]
    task_id = (
        await client.post(
            "/tasks",
            headers=headers,
            json={"projectId": project_id, "name": "ASR Task", "mediaFileId": media_id},
        )
    ).json()["data"]["id"]

    asr = await client.post(f"/tasks/{task_id}/asr", headers=headers)
    assert asr.status_code == 202
    segments = await client.get(f"/tasks/{task_id}/segments", headers=headers)
    assert segments.status_code == 200
    assert len(segments.json()["data"]) >= 1


@pytest.mark.asyncio
async def test_segment_lifecycle_annotations_and_quality_gate(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    headers = {"Authorization": f"Bearer {token}"}
    project_id = (
        await client.post("/projects", headers=headers, json={"name": "Lifecycle"})
    ).json()["data"]["id"]
    media_id = (
        await client.post(
            "/media/upload",
            headers=headers,
            data={"project_id": project_id},
            files={"file": ("lifecycle.wav", b"RIFF", "audio/wav")},
        )
    ).json()["data"]["id"]
    task_id = (
        await client.post(
            "/tasks",
            headers=headers,
            json={"projectId": project_id, "name": "Lifecycle", "mediaFileId": media_id},
        )
    ).json()["data"]["id"]
    segment = (
        await client.post(
            "/segments",
            headers=headers,
            json={"taskId": task_id, "start": 0, "end": 4, "text": "kept text"},
        )
    ).json()["data"]

    overlap = await client.post(
        "/segments",
        headers=headers,
        json={"taskId": task_id, "start": 3, "end": 5, "text": "overlap"},
    )
    assert overlap.status_code == 409
    assert overlap.json()["error"]["code"] == "SEGMENT_OVERLAP"

    split = await client.post(
        f"/segments/{segment['id']}/split",
        headers=headers,
        json={"at": 2, "version": segment["version"]},
    )
    assert split.status_code == 200
    first = split.json()["data"]["first"]
    second = split.json()["data"]["second"]
    assert first["text"] == "kept text"
    assert second["text"] == "kept text"

    comment = await client.post(
        "/comments",
        headers=headers,
        json={"segmentId": first["id"], "text": "check this"},
    )
    marker = await client.post(
        "/markers",
        headers=headers,
        json={
            "segmentId": first["id"],
            "type": "timeline",
            "severity": "warning",
            "description": "at 1.0s",
        },
    )
    assert comment.status_code == 201
    assert marker.status_code == 201
    comments = await client.get(f"/tasks/{task_id}/comments", headers=headers)
    markers = await client.get(f"/tasks/{task_id}/markers", headers=headers)
    assert len(comments.json()["data"]) == 1
    assert len(markers.json()["data"]) == 1

    quality = await client.post(f"/tasks/{task_id}/quality-check", headers=headers)
    assert quality.status_code == 200
    checks = {item["checkType"]: item for item in quality.json()["data"]["checks"]}
    assert checks["segment-overlaps"]["passed"] is True
    assert checks["open-comments"]["passed"] is False
    assert checks["open-markers"]["passed"] is False

    deleted = await client.delete(f"/segments/{first['id']}", headers=headers)
    assert deleted.status_code == 204
    remaining = await client.get(f"/tasks/{task_id}/segments", headers=headers)
    assert [item["id"] for item in remaining.json()["data"]] == [second["id"]]


@pytest.mark.asyncio
async def test_export_task_and_download(client: AsyncClient):
    token = await _login(client, "admin@purrscription.dev")
    headers = {"Authorization": f"Bearer {token}"}
    project_id = (
        await client.post("/projects", headers=headers, json={"name": "Export"})
    ).json()["data"]["id"]
    media_id = (
        await client.post(
            "/media/upload",
            headers=headers,
            data={"project_id": project_id},
            files={"file": ("export.wav", b"RIFF", "audio/wav")},
        )
    ).json()["data"]["id"]
    task_id = (
        await client.post(
            "/tasks",
            headers=headers,
            json={"projectId": project_id, "name": "Export Task", "mediaFileId": media_id},
        )
    ).json()["data"]["id"]
    await client.post(
        "/segments",
        headers=headers,
        json={"taskId": task_id, "start": 0, "end": 2, "text": "hello world"},
    )
    await client.patch(
        f"/tasks/{task_id}",
        headers=headers,
        json={"status": "accepted"},
    )

    export = await client.post(
        f"/tasks/{task_id}/export",
        headers=headers,
        json={"format": "json"},
    )
    assert export.status_code == 201, export.text
    export_id = export.json()["data"]["id"]
    download = await client.get(f"/exports/{export_id}", headers=headers)
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/json")
    assert b"monologues" in download.content
