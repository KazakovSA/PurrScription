import json
import logging
import time
from collections import Counter
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("purrscription.http")
REQUESTS: Counter[tuple[str, str, int]] = Counter()


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid4())
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            logger.exception("request_failed", extra={"request_id": request_id})
            raise
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            route = request.scope.get("route")
            path = getattr(route, "path", request.url.path)
            REQUESTS[(request.method, path, status)] += 1
            logger.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "requestId": request_id,
                        "method": request.method,
                        "path": path,
                        "status": status,
                        "durationMs": duration_ms,
                    }
                )
            )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=()"
        return response


def prometheus_metrics() -> str:
    lines = [
        "# HELP purrscription_http_requests_total Total HTTP requests",
        "# TYPE purrscription_http_requests_total counter",
    ]
    for (method, path, status), count in sorted(REQUESTS.items()):
        safe_path = path.replace('"', '\\"')
        labels = f'method="{method}",path="{safe_path}",status="{status}"'
        lines.append(f"purrscription_http_requests_total{{{labels}}} {count}")
    return "\n".join(lines) + "\n"
