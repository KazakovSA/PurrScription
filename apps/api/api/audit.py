from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.models import AuditLog


async def write_audit(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: str,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    safe_details = _sanitize_details(details)
    entry = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        timestamp=datetime.now(UTC),
        details=safe_details,
    )
    db.add(entry)
    await db.flush()
    return entry


def _sanitize_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    if not details:
        return None
    blocked = {"password", "password_hash", "secret", "token", "access_token", "refresh_token"}
    return {k: v for k, v in details.items() if k.lower() not in blocked}
