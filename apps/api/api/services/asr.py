import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models import ASRRun, ASRStatus, Segment, SegmentStatus


class ASRProvider:
    async def transcribe(self, media_path: Path, duration: float) -> list[dict[str, Any]]:
        raise NotImplementedError


class DeterministicASRMock(ASRProvider):
    """Deterministic ASR output for CI and demo."""

    async def transcribe(self, media_path: Path, duration: float) -> list[dict[str, Any]]:
        del media_path
        chunks = [
            (0.0, 3.5, "Добрый день, это демо TATLIN.", "TATLIN", 0.92),
            (3.5, 7.0, "VEGMAN backup flex archive.", "VEGMAN", 0.45),
            (7.0, 10.5, "UNIFIED storage configuration.", "TATLIN", 0.88),
            (10.5, 14.0, "", "TATLIN", 0.3),
        ]
        return [
            {
                "start": start,
                "end": min(end, duration),
                "text": text,
                "speaker": speaker,
                "confidence": confidence,
            }
            for start, end, text, speaker, confidence in chunks
            if start < duration
        ]


async def start_asr_run(
    db: AsyncSession,
    *,
    task_id: str,
    media_duration: float,
    user_id: str,
) -> ASRRun:
    settings = get_settings()
    existing = (
        await db.execute(
            select(ASRRun).where(
                ASRRun.task_id == task_id, ASRRun.status == ASRStatus.COMPLETED.value
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    run = ASRRun(
        task_id=task_id,
        model=settings.whisper_model,
        version="mock-1",
        device=settings.whisper_device,
        status=ASRStatus.RUNNING.value,
    )
    db.add(run)
    await db.flush()

    provider = DeterministicASRMock()
    raw = await provider.transcribe(Path("mock"), media_duration)
    run.raw_result = {"segments": raw}
    run.status = ASRStatus.COMPLETED.value
    run.completed_at = datetime.now(UTC)

    existing_segments = (
        (await db.execute(select(Segment).where(Segment.task_id == task_id))).scalars().all()
    )
    if not existing_segments:
        for item in raw:
            segment = Segment(
                task_id=task_id,
                start_seconds=round(item["start"], 2),
                end_seconds=round(item["end"], 2),
                text=item["text"],
                speaker=item["speaker"],
                confidence=item["confidence"],
                status=SegmentStatus.PENDING.value,
                updated_by=user_id,
            )
            db.add(segment)

    await db.flush()
    return run


def gecko_export(task_id: str, segments: list[Segment], media_name: str) -> dict[str, Any]:
    monologues = []
    for segment in segments:
        if segment.word_timings:
            terms = segment.word_timings
            monologues.append(
                {
                    "speaker": {"id": segment.speaker or "UNKNOWN"},
                    "start": segment.start_seconds,
                    "end": segment.end_seconds,
                    "text": segment.text,
                    "terms": terms,
                }
            )
            continue
        tokens = re.findall(r"[\w]+(?:[-'][\w]+)*|[^\w\s]", segment.text, flags=re.UNICODE)
        words = [token for token in tokens if re.search(r"\w", token, flags=re.UNICODE)]
        word_duration = (segment.end_seconds - segment.start_seconds) / max(1, len(words))
        word_index = 0
        terms = []
        for token in tokens:
            punctuation = not bool(re.search(r"\w", token, flags=re.UNICODE))
            start = segment.start_seconds + word_index * word_duration
            end = start if punctuation else start + word_duration
            terms.append(
                {
                    "text": token,
                    "type": "PUNCTUATION" if punctuation else "WORD",
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "confidence": segment.confidence,
                }
            )
            if not punctuation:
                word_index += 1
        monologues.append(
            {
                "speaker": {"id": segment.speaker or "UNKNOWN"},
                "start": segment.start_seconds,
                "end": segment.end_seconds,
                "text": segment.text,
                "terms": terms,
            }
        )
    return {
        "schemaVersion": "2.0",
        "format": "gecko",
        "taskId": task_id,
        "media": {"name": media_name},
        "monologues": monologues,
    }


def write_export_file(task_id: str, payload: dict[str, Any], fmt: str) -> tuple[Path, int, str]:
    settings = get_settings()
    export_dir = Path(settings.export_storage_path)
    export_dir.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    checksum = hashlib.sha256(content.encode()).hexdigest()
    path = export_dir / f"{task_id}-{checksum[:8]}.{fmt}"
    path.write_text(content, encoding="utf-8")
    return path, len(content.encode()), checksum
