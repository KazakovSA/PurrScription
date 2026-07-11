#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
DOCKER=false
POSTGRES=false
NO_BROWSER=false

usage() {
  cat <<EOF
Usage: ./start.sh [--docker] [--postgres] [--no-browser] [--api-port N] [--web-port N]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker) DOCKER=true ;;
    --postgres) POSTGRES=true ;;
    --no-browser) NO_BROWSER=true ;;
    --api-port) API_PORT="$2"; shift ;;
    --web-port) WEB_PORT="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

echo
echo "PurrScription - local dev startup"
echo "Root: $ROOT"
echo

command -v npm >/dev/null || { echo "npm not found. Install Node.js 18+."; exit 1; }
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
[[ "$NODE_MAJOR" -ge 18 ]] || { echo "Node.js 18+ required."; exit 1; }

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [[ ! -d node_modules ]]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

wait_health() {
  local url="$1"
  local seconds="${2:-45}"
  for ((i=0; i<seconds; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if $DOCKER; then
  command -v docker >/dev/null || { echo "Docker not found."; exit 1; }
  echo "==> Starting Docker Compose..."
  docker compose up -d --build
  HEALTH="http://127.0.0.1:${API_PORT}/health"
  echo "==> Waiting for API at $HEALTH ..."
  wait_health "$HEALTH" && echo "    API is ready" || echo "    API is not ready yet"
  echo
  echo "    Web: http://localhost:${WEB_PORT}"
  echo "    API: http://localhost:${API_PORT}"
  echo "    Login: admin@purrscription.dev / demo123"
  $NO_BROWSER || xdg-open "http://localhost:${WEB_PORT}" 2>/dev/null || open "http://localhost:${WEB_PORT}" 2>/dev/null || true
  exit 0
fi

PY=""
if command -v py >/dev/null; then PY="py -3.12"; elif command -v python3 >/dev/null; then PY="python3"; else echo "Python 3.12+ not found."; exit 1; fi

echo "==> Installing Python API dependencies..."
$PY -m pip install -e 'apps/api[dev]' -q

SQLITE_URL='sqlite+aiosqlite:///./purrscription.db'
if $POSTGRES; then
  DB_URL="${DATABASE_URL:-}"
  if [[ -z "$DB_URL" && -f .env ]]; then
    DB_URL="$(grep -E '^\s*DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'"' | tr -d ' ')"
  fi
  if [[ -z "$DB_URL" ]]; then
    DB_URL="$SQLITE_URL"
  elif [[ "$DB_URL" == *postgres* ]]; then
    if ! $PY -c 'import asyncio,sys; from sqlalchemy.ext.asyncio import create_async_engine
async def main():
    engine = create_async_engine(sys.argv[1])
    try:
        async with engine.connect(): return 0
    except Exception: return 1
    finally: await engine.dispose()
raise SystemExit(asyncio.run(main()))' "$DB_URL"; then
      echo "    PostgreSQL unavailable. Falling back to SQLite."
      DB_URL="$SQLITE_URL"
    fi
  fi
else
  DB_URL="$SQLITE_URL"
  echo "    Native dev uses SQLite (apps/api/purrscription.db). Pass --postgres for .env DATABASE_URL."
fi
export DATABASE_URL="$DB_URL"
echo "    Database: $DATABASE_URL"

echo "==> Running migrations and seed..."
pushd apps/api >/dev/null
$PY -m alembic upgrade head
$PY -m api.seed
popd >/dev/null

echo "==> Starting API and Web..."
(
  cd apps/api
  export DATABASE_URL="$DB_URL"
  exec $PY -m uvicorn api.main:app --host 127.0.0.1 --port "$API_PORT" --reload
) &
API_PID=$!

(
  cd "$ROOT"
  exec npm run dev -w apps/web -- --host 127.0.0.1 --port "$WEB_PORT"
) &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' EXIT

HEALTH="http://127.0.0.1:${API_PORT}/health"
echo "==> Waiting for API at $HEALTH ..."
wait_health "$HEALTH" && echo "    API is ready" || echo "    API is not ready yet"

echo
echo "    Web: http://localhost:${WEB_PORT}"
echo "    API: http://localhost:${API_PORT}/health"
echo "    Login: admin@purrscription.dev / demo123"
echo
echo "Stop: Ctrl+C"
echo

$NO_BROWSER || xdg-open "http://localhost:${WEB_PORT}" 2>/dev/null || open "http://localhost:${WEB_PORT}" 2>/dev/null || true
wait
