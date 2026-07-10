import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
from api.database import init_db
from api.events import event_bus
from api.exceptions import APIError, api_error_handler, http_exception_handler
from api.routers import (
    auth,
    markers_comments,
    projects_tasks,
    quality_export,
    segments_media,
    websocket,
)
from api.schemas import HealthOut, SuccessResponse

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=settings.log_level)
    await event_bus.connect()
    await init_db()
    yield
    await event_bus.close()


app = FastAPI(
    title="PurrScription API",
    version=settings.contracts_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)

app.include_router(auth.router)
app.include_router(projects_tasks.router)
app.include_router(segments_media.router)
app.include_router(markers_comments.router)
app.include_router(quality_export.router)
app.include_router(websocket.router)


@app.get("/health")
async def health() -> SuccessResponse:
    services = {"database": "healthy", "redis": "healthy", "whisper": "mock"}
    try:
        if event_bus._redis:
            await event_bus._redis.ping()
        else:
            services["redis"] = "degraded"
    except Exception:
        services["redis"] = "unavailable"
    return SuccessResponse(
        data=HealthOut(
            status="healthy",
            timestamp=datetime.now(UTC).isoformat(),
            services=services,
        )
    )


@app.get("/ready")
async def ready() -> SuccessResponse:
    return await health()
