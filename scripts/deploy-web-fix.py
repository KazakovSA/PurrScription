#!/usr/bin/env python3
"""Upload web-related fixes and rebuild web container on VDS."""
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

    sftp = c.open_sftp()
    uploads = {
        "apps/web/src/production/api.ts": ROOT / "apps/web/src/production/api.ts",
        "apps/web/src/production/useWaveformInit.ts": ROOT
        / "apps/web/src/production/useWaveformInit.ts",
        "apps/web/src/production/WaveformEditor.tsx": ROOT
        / "apps/web/src/production/WaveformEditor.tsx",
        "apps/web/src/production/WorkspacePage.tsx": ROOT
        / "apps/web/src/production/WorkspacePage.tsx",
        "apps/web/src/production/store.ts": ROOT
        / "apps/web/src/production/store.ts",
        "apps/web/src/production/segmentAnalysis.ts": ROOT
        / "apps/web/src/production/segmentAnalysis.ts",
        "apps/web/src/production/VerifierChecklist.tsx": ROOT
        / "apps/web/src/production/VerifierChecklist.tsx",
        "apps/web/src/production/HotkeysOverlay.tsx": ROOT
        / "apps/web/src/production/HotkeysOverlay.tsx",
        "apps/web/src/production/styles.css": ROOT
        / "apps/web/src/production/styles.css",
        "infra/nginx.conf": ROOT / "infra/nginx.conf",
    }
    for rel, local in uploads.items():
        with sftp.file(f"{REMOTE}/{rel}", "wb") as f:
            f.write(local.read_bytes())
    sftp.close()

    compose = (
        f"cd {REMOTE} && docker compose --env-file .env.production "
        f"-f docker-compose.prod.yml -f docker-compose.override.yml"
    )
    _, o, e = c.exec_command(f"{compose} build web && {compose} up -d web", timeout=3600)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    code = o.channel.recv_exit_status()
    sys.stdout.buffer.write(out[-2000:].encode("utf-8", "replace"))
    if code != 0:
        sys.stderr.buffer.write(err[-2000:].encode("utf-8", "replace"))
        raise SystemExit(code)
    c.close()
    print("web redeployed")


if __name__ == "__main__":
    main()
