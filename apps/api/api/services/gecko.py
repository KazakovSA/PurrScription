import json
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Segment


def parse_gecko_json(data: dict[str, Any]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    if "tiers" in data:
        for tier in data.get("tiers", []):
            for item in tier.get("annotations", []):
                segments.append(
                    {
                        "start": float(item.get("start", 0)),
                        "end": float(item.get("end", 0)),
                        "text": item.get("text", ""),
                        "speaker": tier.get("name") or item.get("speaker"),
                        "confidence": float(item.get("confidence", 1.0)),
                    }
                )
    elif "segments" in data:
        for item in data["segments"]:
            segments.append(
                {
                    "start": float(item.get("start", 0)),
                    "end": float(item.get("end", 0)),
                    "text": item.get("text", ""),
                    "speaker": item.get("speaker"),
                    "confidence": float(item.get("confidence", 1.0)),
                }
            )
    return segments


async def import_gecko_segments(
    db: AsyncSession,
    *,
    task_id: str,
    gecko_data: dict[str, Any],
    user_id: str,
) -> list[Segment]:
    from api.models import Segment, SegmentStatus

    created: list[Segment] = []
    for item in parse_gecko_json(gecko_data):
        segment = Segment(
            task_id=task_id,
            start_seconds=round(item["start"], 2),
            end_seconds=round(item["end"], 2),
            text=item.get("text", ""),
            speaker=item.get("speaker"),
            confidence=item.get("confidence", 1.0),
            status=SegmentStatus.ANNOTATED.value,
            updated_by=user_id,
        )
        db.add(segment)
        created.append(segment)
    await db.flush()
    return created


def _demo_gecko_candidates() -> list[Path]:
    base = Path(__file__).resolve()
    rel = Path("demo") / "gecko-json" / "demo-interview-001.json"
    candidates: list[Path] = []
    for depth in (2, 5):
        if depth < len(base.parents):
            candidates.append(base.parents[depth] / rel)
    return candidates


def load_demo_gecko() -> dict[str, Any]:
    for demo_path in _demo_gecko_candidates():
        if demo_path.exists():
            return json.loads(demo_path.read_text(encoding="utf-8"))
    return {"segments": []}
