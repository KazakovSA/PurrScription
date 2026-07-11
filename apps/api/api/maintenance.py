import asyncio
from pathlib import Path

from sqlalchemy import select

from api.config import get_settings
from api.database import async_session_factory
from api.models import ExportFile, MediaFile


async def cleanup_orphaned_files() -> dict[str, int]:
    settings = get_settings()
    async with async_session_factory() as db:
        media_keys = set((await db.execute(select(MediaFile.storage_key))).scalars().all())
        export_keys = {
            str(Path(value).resolve())
            for value in (await db.execute(select(ExportFile.storage_key))).scalars().all()
        }
    removed_media = 0
    media_root = Path(settings.media_storage_path)
    if media_root.exists():
        for path in media_root.rglob("*"):
            if path.is_file() and "avatars" not in path.parts:
                key = str(path.relative_to(media_root)).replace("\\", "/")
                if key not in media_keys:
                    path.unlink(missing_ok=True)
                    removed_media += 1
    removed_exports = 0
    export_root = Path(settings.export_storage_path)
    if export_root.exists():
        for path in export_root.glob("*"):
            if path.is_file() and str(path.resolve()) not in export_keys:
                path.unlink(missing_ok=True)
                removed_exports += 1
    return {"media": removed_media, "exports": removed_exports}


def main() -> None:
    print(asyncio.run(cleanup_orphaned_files()))


if __name__ == "__main__":
    main()
