from api.models import Task, TaskAssignment, User, UserRole
from api.schemas import CapabilitiesOut


def can_manage_users(user: User) -> bool:
    return user.role == UserRole.ADMIN.value


def can_manage_projects(user: User) -> bool:
    return user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value}


def can_assign_tasks(user: User) -> bool:
    return user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value}


def _ranges_overlap(
    a_start: float | None,
    a_end: float | None,
    b_start: float | None,
    b_end: float | None,
) -> bool:
    left_a = a_start if a_start is not None else float("-inf")
    right_a = a_end if a_end is not None else float("inf")
    left_b = b_start if b_start is not None else float("-inf")
    right_b = b_end if b_end is not None else float("inf")
    return left_a < right_b and left_b < right_a


def segment_in_assignment(
    segment_start: float,
    segment_end: float,
    assignment: TaskAssignment,
) -> bool:
    left = assignment.start_seconds if assignment.start_seconds is not None else float("-inf")
    right = assignment.end_seconds if assignment.end_seconds is not None else float("inf")
    return segment_start < right and segment_end > left


def can_edit_segment(
    user: User,
    task: Task,
    segment_start: float,
    segment_end: float,
    assignments: list[TaskAssignment],
) -> bool:
    if user.role == UserRole.ADMIN.value:
        return True
    if user.role == UserRole.SUPERVISOR.value:
        return True
    if user.role == UserRole.VERIFIER.value:
        return task.status == "review" and task.assigned_to != user.id
    if user.role == UserRole.ANNOTATOR.value:
        user_assignments = [item for item in assignments if item.user_id == user.id]
        if user_assignments:
            return any(
                segment_in_assignment(segment_start, segment_end, item)
                for item in user_assignments
            )
        return task.assigned_to == user.id
    return False


def can_edit_task(user: User, task: Task) -> bool:
    if user.role == UserRole.ADMIN.value:
        return True
    if user.role == UserRole.SUPERVISOR.value:
        return True
    if user.role == UserRole.VERIFIER.value:
        return task.status == "review" and task.assigned_to != user.id
    if user.role == UserRole.ANNOTATOR.value:
        return task.assigned_to == user.id
    return False


def can_view_task(user: User, task: Task) -> bool:
    if user.role == UserRole.CUSTOMER.value:
        return task.status in {"accepted", "exported"}
    if user.role == UserRole.ML_ENGINEER.value:
        return True
    if user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value, UserRole.VERIFIER.value}:
        return True
    if user.role == UserRole.ANNOTATOR.value:
        return task.assigned_to == user.id
    return False


def can_verify_task(user: User, task: Task) -> bool:
    if user.role not in {UserRole.ADMIN.value, UserRole.VERIFIER.value, UserRole.SUPERVISOR.value}:
        return False
    if user.role == UserRole.ANNOTATOR.value:
        return False
    return task.assigned_to != user.id


def can_export(user: User) -> bool:
    return user.role in {
        UserRole.ADMIN.value,
        UserRole.SUPERVISOR.value,
        UserRole.VERIFIER.value,
        UserRole.ML_ENGINEER.value,
        UserRole.CUSTOMER.value,
    }


def can_run_asr(user: User) -> bool:
    return user.role in {
        UserRole.ADMIN.value,
        UserRole.SUPERVISOR.value,
        UserRole.ML_ENGINEER.value,
    }


def can_edit_terms(user: User) -> bool:
    return user.role in {
        UserRole.ADMIN.value,
        UserRole.SUPERVISOR.value,
        UserRole.ML_ENGINEER.value,
    }


def can_view_analytics(user: User) -> bool:
    return user.role != UserRole.CUSTOMER.value


def user_capabilities(user: User) -> CapabilitiesOut:
    return CapabilitiesOut(
        manage_users=can_manage_users(user),
        manage_projects=can_manage_projects(user),
        assign_tasks=can_assign_tasks(user),
        export=can_export(user),
        run_asr=can_run_asr(user),
        verify_tasks=user.role
        in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value, UserRole.VERIFIER.value},
        edit_terms=can_edit_terms(user),
        view_analytics=can_view_analytics(user),
    )


def require_role(user: User, roles: set[str]) -> None:
    from api.exceptions import APIError

    if user.role not in roles:
        raise APIError(403, "AUTHORIZATION_ERROR", "Insufficient permissions")
