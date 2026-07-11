from api.models import Segment
from api.services.asr import gecko_export
from api.services.gecko import parse_gecko_json


def test_parse_gecko_monologues_format() -> None:
    payload = {
        "schemaVersion": "2.0",
        "monologues": [
            {
                "speaker": {"id": "spk1", "name": "Speaker A"},
                "start": 0.5,
                "end": 2.4,
                "terms": [
                    {"start": 0.5, "end": 1.0, "text": "Hello", "confidence": 0.91, "type": "WORD"},
                    {
                        "start": 1.0,
                        "end": 1.1,
                        "text": ",",
                        "confidence": 0.91,
                        "type": "PUNCTUATION",
                    },
                    {"start": 1.1, "end": 2.4, "text": "world", "confidence": 0.88, "type": "WORD"},
                ],
            }
        ],
    }

    segments = parse_gecko_json(payload)

    assert len(segments) == 1
    assert segments[0]["start"] == 0.5
    assert segments[0]["end"] == 2.4
    assert segments[0]["speaker"] == "Speaker A"
    assert segments[0]["text"] == "Hello, world"


def test_parse_gecko_segments_format() -> None:
    payload = {
        "segments": [
            {"start": 1.0, "end": 3.0, "text": "demo", "speaker": "TATLIN", "confidence": 0.8}
        ]
    }

    segments = parse_gecko_json(payload)

    assert len(segments) == 1
    assert segments[0]["text"] == "demo"


def test_parse_gecko_root_monologue_array() -> None:
    payload = [
        {
            "speaker": {"id": "Roger"},
            "terms": [{"start": 0.03, "end": 0.66, "text": "Hi", "type": "WORD"}],
        }
    ]

    segments = parse_gecko_json(payload)

    assert len(segments) == 1
    assert segments[0]["speaker"] == "Roger"


def test_parse_gecko_wrapped_data_object() -> None:
    payload = {
        "data": {
            "monologues": [
                {
                    "speaker": {"id": "A"},
                    "terms": [{"start": 1.0, "end": 2.0, "text": "ok", "type": "WORD"}],
                }
            ]
        }
    }

    segments = parse_gecko_json(payload)

    assert len(segments) == 1


def test_parse_gecko_utterances_format() -> None:
    payload = {
        "utterances": [
            {"start": 1.0, "end": 2.5, "text": "hello", "speaker": "Speaker 1"},
        ]
    }

    segments = parse_gecko_json(payload)

    assert len(segments) == 1
    assert segments[0]["text"] == "hello"


def test_parse_gecko_unknown_format_returns_empty() -> None:
    assert parse_gecko_json({"metadata": {"duration": 10}}) == []


def test_gecko_export_round_trip_preserves_exact_word_timings() -> None:
    terms = [
        {"text": "Привет", "type": "WORD", "start": 1.12, "end": 1.61, "confidence": 0.98},
        {"text": "!", "type": "PUNCTUATION", "start": 1.61, "end": 1.61, "confidence": 0.98},
    ]
    segment = Segment(
        id="segment-1",
        task_id="task-1",
        start_seconds=1.12,
        end_seconds=1.61,
        text="Привет!",
        speaker="SPEAKER_00",
        confidence=0.98,
        word_timings=terms,
        updated_by="user-1",
    )

    payload = gecko_export("task-1", [segment], "audio.wav")
    parsed = parse_gecko_json(payload)

    assert payload["monologues"][0]["terms"] == terms
    assert parsed[0]["word_timings"] == terms
    assert parsed[0]["text"] == "Привет!"
