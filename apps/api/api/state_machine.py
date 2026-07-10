from api.exceptions import APIError
from api.models import TaskStatus

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    TaskStatus.NEW.value: {TaskStatus.ASSIGNED.value},
    TaskStatus.ASSIGNED.value: {TaskStatus.IN_PROGRESS.value, TaskStatus.ASSIGNED.value},
    TaskStatus.IN_PROGRESS.value: {TaskStatus.REVIEW.value, TaskStatus.IN_PROGRESS.value},
    TaskStatus.REVIEW.value: {
        TaskStatus.REWORK.value,
        TaskStatus.ACCEPTED.value,
        TaskStatus.REVIEW.value,
    },
    TaskStatus.REWORK.value: {TaskStatus.FIXED.value, TaskStatus.IN_PROGRESS.value},
    TaskStatus.FIXED.value: {TaskStatus.REVIEW.value},
    TaskStatus.ACCEPTED.value: {TaskStatus.EXPORTED.value},
    TaskStatus.EXPORTED.value: set(),
}


def validate_transition(current: str, new_status: str) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if new_status not in allowed and new_status != current:
        raise APIError(
            409,
            "CONFLICT",
            f"Invalid task status transition: {current} -> {new_status}",
            {"current": current, "requested": new_status, "allowed": sorted(allowed)},
        )
