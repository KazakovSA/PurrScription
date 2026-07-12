#!/usr/bin/env python3
"""One-shot deploy to FirstByte VDS via SSH/SFTP."""
from __future__ import annotations

import io
import secrets
import sys
import tarfile
import time
from pathlib import Path

import paramiko

HOST = "185.212.148.223"
USER = "root"
PASSWORD = "mYKUPTnm6qEm"
REMOTE_DIR = "/opt/purrscription"
PUBLIC_ORIGIN = f"http://{HOST}"
ROOT = Path(__file__).resolve().parents[1]

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "dist",
    "storage",
    "test-results",
    "playwright-report",
    ".cursor",
    "backups",
    "agent-transcripts",
    "terminals",
}
EXCLUDE_FILES = {".env", "purrscription.db"}
MAX_ARCHIVE_MB = 100


def should_skip(path: Path) -> bool:
    parts = path.parts
    if any(part in EXCLUDE_DIRS for part in parts):
        return True
    if path.suffix in {".pyc", ".db", ".sqlite", ".sqlite3"}:
        return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.name.endswith(".map") and "dist" in parts:
        return True
    return False


def make_archive() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for item in ROOT.rglob("*"):
            if not item.is_file():
                continue
            rel = item.relative_to(ROOT)
            if should_skip(rel):
                continue
            tar.add(item, arcname=str(rel).replace("\\", "/"))
    return buf.getvalue()


def _write_out(text: str) -> None:
    sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> str:
    print(f"$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        _write_out(out.rstrip() + "\n")
    if err.strip():
        sys.stderr.buffer.write(err.rstrip().encode("utf-8", errors="replace") + b"\n")
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return out


def main() -> None:
    pg_pass = secrets.token_urlsafe(18)
    redis_pass = secrets.token_urlsafe(18)
    secret_key = secrets.token_urlsafe(48)

    env_content = f"""POSTGRES_DB=purrscription
POSTGRES_USER=purrscription
POSTGRES_PASSWORD={pg_pass}
REDIS_PASSWORD={redis_pass}
SECRET_KEY={secret_key}
PUBLIC_ORIGIN={PUBLIC_ORIGIN}
HTTP_PORT=80
"""

    override_content = """services:
  api:
    command:
      - sh
      - -c
      - alembic upgrade head && uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=*
"""

    print("==> Packing project archive...")
    archive = make_archive()
    archive_mb = len(archive) / 1024 / 1024
    print(f"    Archive size: {archive_mb:.1f} MB")
    if archive_mb > MAX_ARCHIVE_MB:
        raise RuntimeError(
            f"Archive is {archive_mb:.1f} MB (limit {MAX_ARCHIVE_MB} MB). "
            "Check that node_modules, dist, storage and .git are excluded."
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"==> Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60)

    print("==> Installing Docker (if needed)...")
    run(
        client,
        "command -v docker >/dev/null 2>&1 || "
        "(apt-get update -qq && apt-get install -y -qq ca-certificates curl git && "
        "curl -fsSL https://get.docker.com | sh && systemctl enable --now docker)",
        timeout=900,
    )

    print("==> Adding 2G swap (if missing)...")
    run(
        client,
        "test -f /swapfile || "
        "(fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && "
        "swapon /swapfile && grep -q swapfile /etc/fstab || "
        "echo '/swapfile none swap sw 0 0' >> /etc/fstab)",
        timeout=120,
    )

    print("==> Uploading project...")
    run(client, f"mkdir -p {REMOTE_DIR}")
    sftp = client.open_sftp()
    remote_tar = f"{REMOTE_DIR}/project.tgz"
    remote_tmp = f"{remote_tar}.tmp"
    with sftp.file(remote_tmp, "wb") as remote:
        chunk_size = 1024 * 1024
        for offset in range(0, len(archive), chunk_size):
            remote.write(archive[offset : offset + chunk_size])
    stat = sftp.stat(remote_tmp)
    sftp.close()
    if stat.st_size != len(archive):
        raise RuntimeError(
            f"Upload incomplete: sent {len(archive)} bytes, remote has {stat.st_size}"
        )
    run(client, f"mv -f {remote_tmp} {remote_tar}")
    run(client, f"tar -xzf {remote_tar} -C {REMOTE_DIR} && rm -f {remote_tar}")

    print("==> Writing production env...")
    run(
        client,
        f"cat > {REMOTE_DIR}/.env.production << 'ENVEOF'\n{env_content}ENVEOF",
    )
    run(
        client,
        f"cat > {REMOTE_DIR}/docker-compose.override.yml << 'OVEOF'\n{override_content}OVEOF",
    )
    run(client, f"mkdir -p {REMOTE_DIR}/backups")

    print("==> Building containers (this may take several minutes)...")
    compose = (
        f"cd {REMOTE_DIR} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f docker-compose.override.yml"
    )
    run(client, f"{compose} build", timeout=3600)
    run(client, f"{compose} up -d", timeout=600)

    print("==> Waiting for API readiness...")
    for attempt in range(30):
        try:
            run(client, f"curl -fsS http://127.0.0.1/api/ready >/dev/null")
            break
        except RuntimeError:
            time.sleep(5)
    else:
        raise RuntimeError("API did not become ready in time")

    print("==> Seeding demo data...")
    run(
        client,
        f"{compose} exec -T api python -m api.seed",
        timeout=300,
    )

    print("==> Smoke checks...")
    run(client, "curl -fsS http://127.0.0.1/health")
    run(client, "curl -fsS http://127.0.0.1/api/health")
    run(client, "curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1/")

    client.close()
    print()
    print("=" * 60)
    print("DEPLOYED OK")
    print(f"Site:    {PUBLIC_ORIGIN}")
    print(f"Login:   admin@purrscription.dev / demo123")
    print("=" * 60)
    print("IMPORTANT: rotate the VPS root password and panel passwords")
    print("after verifying the deployment (they were shared in chat).")


if __name__ == "__main__":
    main()
