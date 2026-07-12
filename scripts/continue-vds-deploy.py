#!/usr/bin/env python3
"""Continue deploy after archive upload."""
from __future__ import annotations

import secrets
import sys
import time

import paramiko

HOST = "185.212.148.223"
USER = "root"
PASSWORD = "mYKUPTnm6qEm"
REMOTE = "/opt/purrscription"
PUBLIC = f"http://{HOST}"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> str:
    print(f"$ {cmd[:140]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out[-4000:] if len(out) > 4000 else out.rstrip())
    if code != 0:
        print(err[-2000:], file=sys.stderr)
        raise SystemExit(f"failed ({code})")
    return out


def main() -> None:
    env = f"""POSTGRES_DB=purrscription
POSTGRES_USER=purrscription
POSTGRES_PASSWORD={secrets.token_urlsafe(18)}
REDIS_PASSWORD={secrets.token_urlsafe(18)}
SECRET_KEY={secrets.token_urlsafe(48)}
PUBLIC_ORIGIN={PUBLIC}
HTTP_PORT=80
"""
    override = """services:
  api:
    command:
      - sh
      - -c
      - alembic upgrade head && uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=*
"""

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=60)

    if run(client, f"test -f {REMOTE}/project.tgz && echo yes").strip() == "yes":
        print("==> Extracting archive...")
        run(client, f"tar -xzf {REMOTE}/project.tgz -C {REMOTE} && rm -f {REMOTE}/project.tgz")

    sftp = client.open_sftp()
    with sftp.file(f"{REMOTE}/.env.production", "w") as f:
        f.write(env)
    with sftp.file(f"{REMOTE}/docker-compose.override.yml", "w") as f:
        f.write(override)
    sftp.close()

    run(client, f"mkdir -p {REMOTE}/backups")
    compose = (
        f"cd {REMOTE} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f docker-compose.override.yml"
    )

    print("==> Building...")
    run(client, f"{compose} build", timeout=3600)
    print("==> Starting...")
    run(client, f"{compose} up -d", timeout=600)

    print("==> Waiting for API...")
    for _ in range(40):
        try:
            run(client, "curl -fsS http://127.0.0.1/api/ready", timeout=30)
            break
        except SystemExit:
            time.sleep(5)
    else:
        raise SystemExit("API not ready")

    print("==> Seeding...")
    run(client, f"{compose} exec -T api python -m api.seed", timeout=300)
    run(client, "curl -fsS http://127.0.0.1/api/health")
    print(f"\nDONE: {PUBLIC}")
    client.close()


if __name__ == "__main__":
    main()
