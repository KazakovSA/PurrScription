#!/usr/bin/env python3
import json
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS -X POST http://127.0.0.1/api/auth/login -H "Content-Type: application/json" -d \'{"email":"hauras@gmail.com","password":"demo123"}\' -w "\\nHTTP:%{http_code}\\n"',
    'curl -sS -X POST http://purrscription.ru/api/auth/login -H "Content-Type: application/json" -d \'{"email":"hauras@gmail.com","password":"demo123"}\' -w "\\nHTTP:%{http_code}\\n"',
    'curl -sS -I http://purrscription.ru/login 2>&1 | head -20',
    'grep -o "VITE_API_URL[^\"]*" /usr/share/nginx/html/assets/*.js 2>/dev/null | head -5 || docker exec purrscription-web-1 sh -c "grep -o \"/api\" /usr/share/nginx/html/assets/*.js | head -3"',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:90], "===")
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err)
c.close()
