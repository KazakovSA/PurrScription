#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS --resolve purrscription.ru:443:37.140.192.187 -k https://purrscription.ru/assets/index-BDfmQLw8.js 2>/dev/null | tr "," "\\n" | grep -E "localhost|127\\.0\\.0\\.1|/api|VITE|8000" | head -20',
    'docker exec purrscription-web-1 sh -c "ls /usr/share/nginx/html/assets/index-*.js"',
    'docker exec purrscription-web-1 sh -c "cat /usr/share/nginx/html/assets/index-*.js" | tr "," "\\n" | grep -E "localhost|127\\.0\\.0\\.1|/api|8000|ngrok" | head -20',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:100], "===")
    _, o, e = c.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", "replace")
    print(out[:3000] if out else "(empty)")
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err.strip()[:500])
c.close()
