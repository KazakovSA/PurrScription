from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class APIError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.details = details
        super().__init__(status_code=status_code, detail=message)


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        },
    )


async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, str(exc.detail), exc.details)


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = "VALIDATION_ERROR" if exc.status_code == 400 else "INTERNAL_SERVER_ERROR"
    if exc.status_code == 401:
        code = "AUTHENTICATION_ERROR"
    elif exc.status_code == 403:
        code = "AUTHORIZATION_ERROR"
    elif exc.status_code == 404:
        code = "RESOURCE_NOT_FOUND"
    elif exc.status_code == 409:
        code = "CONFLICT"
    elif exc.status_code == 422:
        code = "QUALITY_GATE_FAILED"
    return error_response(exc.status_code, code, str(exc.detail))
