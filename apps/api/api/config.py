from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

def _find_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "package.json").exists() or (parent / "docker-compose.prod.yml").exists():
            return parent
    # Docker image layout: /app/api/config.py
    return here.parents[1]


_REPO_ROOT = _find_repo_root()
_ENV_FILES = (
    _REPO_ROOT / ".env",
    Path(__file__).resolve().parents[1] / ".env",
    Path(".env"),
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=tuple(str(path) for path in _ENV_FILES if path.exists()) or (".env",),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite+aiosqlite:///./purrscription.db"
    redis_url: str = "redis://localhost:6379"
    environment: str = "development"
    debug: bool = Field(default=True, validation_alias="PURRSCRIPTION_DEBUG")
    log_level: str = "INFO"
    secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    jwt_refresh_expiration_days: int = 7
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    feature_quality_firewall: bool = True
    feature_demo_mode: bool = False
    demo_user_password: str = "demo123"
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    feature_faster_whisper: bool = False
    media_storage_path: str = "./storage/media"
    export_storage_path: str = "./storage/exports"
    max_upload_bytes: int = 500 * 1024 * 1024
    lock_ttl_seconds: int = 300
    presence_ttl_seconds: int = 300
    contracts_version: str = "1.0.0"

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment == "production":
            if len(self.secret_key) < 64 or self.secret_key == "dev-secret-change-in-production":
                raise ValueError("Production SECRET_KEY must contain at least 64 random characters")
            if self.debug or self.feature_demo_mode:
                raise ValueError("Debug and demo mode must be disabled in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("SQLite is not supported in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
