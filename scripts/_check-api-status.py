#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
REMOTE = "/opt/purrscription"
COMPOSE = (
    f"cd {REMOTE} && docker compose --env-file .env.production "
    f"-f docker-compose.prod.yml -f docker-compose.override.yml"
)

cmds = [
    'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
    f"{COMPOSE} ps",
    'curl -sS -o /dev/null -w "ip:%{http_code}\\n" http://127.0.0.1/api/health || echo ip_fail',
    'curl -sS -o /dev/null -w "domain:%{http_code}\\n" http://purrscription.ru/api/health || echo domain_fail',
    'curl -sS -o /dev/null -w "https:%{http_code}\\n" https://purrscription.ru/api/health || echo https_fail',
    f"grep -E 'PUBLIC_ORIGIN|CORS|VITE' {REMOTE}/.env.production || true",
    "docker logs purrscription-api-1 --tail 40 2>&1",
    "docker logs purrscription-web-1 --tail 20 2>&1",
    "docker logs purrscription-caddy-1 --tail 20 2>&1 || true",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:100], "===")
    _, o, e = c.exec_command(cmd, timeout=90)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)
c.close()
