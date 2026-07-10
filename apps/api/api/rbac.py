from api.models import Task, User, UserRole


def can_manage_users(user: User) -> bool:
    return user.role == UserRole.ADMIN.value


def can_manage_projects(user: User) -> bool:
    return user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value}


def can_assign_tasks(user: User) -> bool:
    return user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value}


def can_edit_task(user: User, task: Task) -> bool:
    if user.role == UserRole.ADMIN.value:
        return True
    if user.role == UserRole.SUPERVISOR.value:
        return True
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
    }


def require_role(user: User, roles: set[str]) -> None:
    from api.exceptions import APIError

    if user.role not in roles:
        raise APIError(403, "AUTHORIZATION_ERROR", "Insufficient permissions")
