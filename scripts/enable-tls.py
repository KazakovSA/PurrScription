#!/usr/bin/env python3
"""Switch the VDS deployment to HTTPS via Caddy (Let's Encrypt).

Run this ONLY after purrscription.ru (A + www) points to the VDS IP.
It uploads the Caddyfile + TLS compose override, flips PUBLIC_ORIGIN/CORS to
https, and redeploys. Caddy obtains and auto-renews the certificate.
"""
from __future__ import annotations

import socket
import sys
import time
from pathlib import Path

import paramiko

HOST = "185.212.148.223"
USER = "root"
PASSWORD = "mYKUPTnm6qEm"
REMOTE = "/opt/purrscription"
DOMAIN = "purrscription.ru"
PUBLIC_ORIGIN = f"https://{DOMAIN}"
ROOT = Path(__file__).resolve().parents[1]


def _w(text: str) -> None:
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 1800, check: bool = True) -> tuple[int, str]:
    _w(f"$ {cmd[:140]}\n")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        _w(out[-4000:] + "\n")
    if err.strip():
        sys.stderr.buffer.write(err[-2000:].encode("utf-8", "replace") + b"\n")
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return code, out


def check_dns() -> None:
    try:
        ips = {ai[4][0] for ai in socket.getaddrinfo(DOMAIN, None)}
    except socket.gaierror:
        ips = set()
    if HOST not in ips:
        _w(
            f"WARNING: {DOMAIN} resolves to {ips or 'nothing'}, expected {HOST}.\n"
            "Let's Encrypt will fail until DNS points to the VDS.\n"
            "Update the A record (and remove/repoint any AAAA) first.\n"
        )
        answer = input("Continue anyway? [y/N] ").strip().lower()
        if answer != "y":
            raise SystemExit("Aborted: DNS not pointing to VDS yet.")


def main() -> None:
    check_dns()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=60)

    sftp = c.open_sftp()
    uploads = {
        "infra/Caddyfile": ROOT / "infra/Caddyfile",
        "infra/docker-compose.tls.yml": ROOT / "infra/docker-compose.tls.yml",
        "infra/nginx.conf": ROOT / "infra/nginx.conf",
    }
    for rel, local in uploads.items():
        with sftp.file(f"{REMOTE}/{rel}", "wb") as f:
            f.write(local.read_bytes())
    sftp.close()

    # Flip PUBLIC_ORIGIN to https (CORS derives from it on the API side).
    run(
        c,
        f"sed -i 's#^PUBLIC_ORIGIN=.*#PUBLIC_ORIGIN={PUBLIC_ORIGIN}#' {REMOTE}/.env.production "
        f"&& grep PUBLIC_ORIGIN {REMOTE}/.env.production",
    )

    compose = (
        f"cd {REMOTE} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f infra/docker-compose.tls.yml"
    )
    # Rebuild web so the SPA is served under the https origin, then bring up Caddy.
    run(c, f"{compose} build web", timeout=3600)
    run(c, f"{compose} up -d", timeout=600)

    _w("==> Waiting for certificate + HTTPS...\n")
    ok = False
    for _ in range(30):
        code, _out = run(c, f"curl -fsS -o /dev/null -w '%{{http_code}}' https://{DOMAIN}/health", check=False)
        if code == 0:
            ok = True
            break
        time.sleep(6)
    run(c, f"{compose} ps")
    c.close()
    _w("\n" + "=" * 56 + "\n")
    if ok:
        _w(f"HTTPS LIVE: {PUBLIC_ORIGIN}\n")
    else:
        _w(f"HTTPS not confirmed yet. Check: docker compose logs caddy\n")
    _w("=" * 56 + "\n")


if __name__ == "__main__":
    main()
