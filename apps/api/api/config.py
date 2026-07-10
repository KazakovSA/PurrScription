from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./purrscription.db"
    redis_url: str = "redis://localhost:6379"
    environment: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    jwt_refresh_expiration_days: int = 7
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    feature_quality_firewall: bool = True
    feature_demo_mode: bool = True
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
