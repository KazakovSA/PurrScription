#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS -m 8 -k -I https://purrscription.ru/ 2>&1 | head -20',
    'curl -sS -m 8 -k https://purrscription.ru/ 2>&1 | head -8',
    'curl -sS -m 8 -k -I https://purrscription.ru/login 2>&1 | head -15',
    'curl -sS -m 8 -k -o /dev/null -w "https_login:%{http_code}\\n" -X POST https://purrscription.ru/api/auth/login -H "Content-Type: application/json" -d \'{"email":"x","password":"y"}\' 2>&1',
    'curl -sS -m 5 --resolve purrscription.ru:443:37.140.192.187 -k -I https://purrscription.ru/login 2>&1 | head -15',
    'curl -sS -m 5 --resolve purrscription.ru:443:37.140.192.187 -k https://purrscription.ru/login 2>&1 | head -10',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:110], "===")
    _, o, e = c.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err.strip())
c.close()
