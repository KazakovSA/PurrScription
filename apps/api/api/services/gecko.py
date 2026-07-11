import json
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Segment


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _speaker_value(raw: Any) -> str | None:
    if isinstance(raw, dict):
        for key in ("name", "id", "value", "display", "label"):
            candidate = raw.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def _monologue_text(monologue: dict[str, Any]) -> str:
    text = monologue.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    words = monologue.get("terms") or monologue.get("words") or []
    parts: list[str] = []
    for word in words:
        if not isinstance(word, dict):
            continue
        chunk = str(word.get("text", ""))
        if not chunk:
            continue
        word_type = str(word.get("type", "")).upper()
        if word_type == "PUNCTUATION" and parts:
            parts[-1] += chunk
        elif parts:
            parts.append(f" {chunk}")
        else:
            parts.append(chunk)
    return "".join(parts).strip()


def _monologue_confidence(monologue: dict[str, Any]) -> float:
    words = monologue.get("terms") or monologue.get("words") or []
    confidences = [
        _as_float(word.get("confidence"))
        for word in words
        if isinstance(word, dict) and word.get("confidence") is not None
    ]
    if confidences:
        return round(sum(confidences) / len(confidences), 4)
    return _as_float(monologue.get("confidence"), 1.0)


def _monologue_bounds(monologue: dict[str, Any]) -> tuple[float, float]:
    words = monologue.get("terms") or monologue.get("words") or []
    if words and isinstance(words[0], dict) and isinstance(words[-1], dict):
        term_start = _as_float(words[0].get("start", words[0].get("startTime")))
        term_end = _as_float(words[-1].get("end", words[-1].get("endTime")))
        if term_end > term_start:
            return term_start, term_end

    start = _as_float(monologue.get("start", monologue.get("startTime", monologue.get("begin"))))
    end = _as_float(monologue.get("end", monologue.get("endTime", monologue.get("finish"))))
    return start, end


def _append_segment(
    segments: list[dict[str, Any]],
    *,
    start: float,
    end: float,
    text: str,
    speaker: str | None,
    confidence: float,
    word_timings: list[dict[str, Any]] | None = None,
) -> None:
    if end <= start:
        return
    segments.append(
        {
            "start": start,
            "end": end,
            "text": text,
            "speaker": speaker,
            "confidence": confidence,
            "word_timings": word_timings,
        }
    )


def _parse_segment_dict(
    item: dict[str, Any], *, default_speaker: str | None = None
) -> dict[str, Any]:
    return {
        "start": _as_float(
            item.get("start", item.get("startTime", item.get("begin", item.get("offset"))))
        ),
        "end": _as_float(item.get("end", item.get("endTime", item.get("finish")))),
        "text": str(item.get("text", item.get("transcript", item.get("content", "")))),
        "speaker": _speaker_value(item.get("speaker")) or default_speaker,
        "confidence": _as_float(item.get("confidence", item.get("score")), 1.0),
        "word_timings": item.get("terms") or item.get("words"),
    }


def _parse_monologues(monologues: list[Any], segments: list[dict[str, Any]]) -> None:
    for monologue in monologues:
        if not isinstance(monologue, dict):
            continue
        start, end = _monologue_bounds(monologue)
        _append_segment(
            segments,
            start=start,
            end=end,
            text=_monologue_text(monologue),
            speaker=_monologue_speaker(monologue),
            confidence=_monologue_confidence(monologue),
            word_timings=monologue.get("terms") or monologue.get("words"),
        )


def _monologue_speaker(monologue: dict[str, Any]) -> str | None:
    return _speaker_value(monologue.get("speaker"))


def _looks_like_segment_payload(data: Any) -> bool:
    if isinstance(data, list):
        return bool(data) and all(isinstance(item, dict) for item in data)
    if isinstance(data, dict):
        if any(
            isinstance(data.get(key), list) and data.get(key)
            for key in (
                "monologues",
                "tiers",
                "segments",
                "utterances",
                "annotations",
                "regions",
                "items",
            )
        ):
            return True
        return any(
            key in data for key in ("terms", "words", "start", "startTime", "end", "endTime")
        )
    return False


def _normalize_gecko_payload(data: Any, *, depth: int = 0) -> Any:
    if depth > 4:
        return data

    if isinstance(data, list):
        if not data:
            return data
        if all(isinstance(item, dict) for item in data):
            if any("terms" in item or "words" in item for item in data):
                return {"monologues": data}
            if any("start" in item or "startTime" in item for item in data):
                return {"segments": data}
        return data

    if not isinstance(data, dict):
        return data

    if _looks_like_segment_payload(data):
        return data

    for key in ("data", "annotation", "result", "payload", "content", "file", "transcript"):
        nested = data.get(key)
        if isinstance(nested, (dict, list)):
            normalized = _normalize_gecko_payload(nested, depth=depth + 1)
            if _looks_like_segment_payload(normalized):
                return normalized

    files = data.get("files")
    if isinstance(files, list):
        for entry in files:
            if not isinstance(entry, dict):
                continue
            nested = entry.get("data", entry.get("monologues"))
            if nested is None:
                continue
            normalized = _normalize_gecko_payload(nested, depth=depth + 1)
            if _looks_like_segment_payload(normalized):
                return normalized

    return data


def parse_gecko_json(data: Any) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    payload = _normalize_gecko_payload(data)

    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            if "terms" in item or "words" in item:
                _parse_monologues([item], segments)
                continue
            parsed = _parse_segment_dict(item)
            _append_segment(segments, **parsed)
        return segments

    if not isinstance(payload, dict):
        return segments

    if "monologues" in payload:
        _parse_monologues(payload.get("monologues", []), segments)
        if segments:
            return segments

    if "tiers" in payload:
        for tier in payload.get("tiers", []):
            if not isinstance(tier, dict):
                continue
            tier_name = _speaker_value(tier.get("name")) or (
                tier.get("name") if isinstance(tier.get("name"), str) else None
            )
            for item in tier.get("annotations", []):
                if not isinstance(item, dict):
                    continue
                parsed = _parse_segment_dict(item, default_speaker=tier_name)
                _append_segment(segments, **parsed)
        if segments:
            return segments

    for key in ("segments", "utterances", "annotations", "regions", "items"):
        items = payload.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            if "terms" in item or "words" in item:
                _parse_monologues([item], segments)
            else:
                parsed = _parse_segment_dict(item)
                _append_segment(segments, **parsed)
        if segments:
            return segments

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
            word_timings=item.get("word_timings"),
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
