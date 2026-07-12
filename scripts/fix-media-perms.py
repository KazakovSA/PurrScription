#!/usr/bin/env python3
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
HOST, USER, PASSWORD = "185.212.148.223", "root", "mYKUPTnm6qEm"
REMOTE = "/opt/purrscription"


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=60)
    compose = (
        f"cd {REMOTE} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f docker-compose.override.yml"
    )

    print("==> Hotfix permissions")
    _, o, e = c.exec_command(
        f"{compose} exec -u root -T api sh -c "
        f"'mkdir -p /data/media /data/exports /data/media/avatars && "
        f"chown -R 1000:1000 /data && ls -la /data'",
        timeout=60,
    )
    sys.stdout.buffer.write(o.read())
    sys.stdout.buffer.write(e.read())

    sftp = c.open_sftp()
    for rel in ("infra/docker-entrypoint-api.sh", "infra/Dockerfile.api"):
        with sftp.file(f"{REMOTE}/{rel}", "wb") as f:
            f.write((ROOT / rel).read_bytes())
    sftp.close()

    print("==> Rebuild api")
    _, o, e = c.exec_command(f"{compose} build api && {compose} up -d api", timeout=3600)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    sys.stdout.buffer.write(out[-2500:].encode("utf-8", "replace"))
    if code != 0:
        sys.stderr.buffer.write(err[-2000:].encode("utf-8", "replace"))
        raise SystemExit(code)

    _, o, e = c.exec_command(
        f"{compose} exec -T api ls -la /data && {compose} exec -T api ls -la /data/media",
        timeout=60,
    )
    sys.stdout.buffer.write(o.read())
    c.close()
    print("DONE")


if __name__ == "__main__":
    main()
