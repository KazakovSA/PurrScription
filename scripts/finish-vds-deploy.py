#!/usr/bin/env python3
"""Finish docker build/up/seed on VDS."""
import sys
import time

import paramiko

HOST = "185.212.148.223"
USER = "root"
PASSWORD = "mYKUPTnm6qEm"
REMOTE = "/opt/purrscription"
PUBLIC = f"http://{HOST}"


def run(c, cmd, timeout=3600):
    print("$", cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    if code != 0:
        sys.stderr.write(err[-3000:])
        raise SystemExit(code)
    return out


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=60)
    compose = (
        f"cd {REMOTE} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f docker-compose.override.yml"
    )
    print("==> Building web image...")
    run(c, f"{compose} build web", timeout=3600)
    print("==> Starting stack...")
    run(c, f"{compose} up -d", timeout=600)
    print("==> Waiting for API...")
    for _ in range(40):
        try:
            run(c, "curl -fsS http://127.0.0.1/api/ready", timeout=30)
            break
        except SystemExit:
            time.sleep(5)
    else:
        raise SystemExit("API not ready")
    print("==> Seeding...")
    run(c, f"{compose} exec -T api python -m api.seed", timeout=300)
    run(c, "curl -fsS http://127.0.0.1/api/health")
    print(f"\nDONE {PUBLIC}")
    c.close()


if __name__ == "__main__":
    main()
