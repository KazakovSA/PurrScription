#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS -m 8 --resolve purrscription.ru:443:37.140.192.187 -k -I https://purrscription.ru/login 2>&1',
    'curl -sS -m 8 --resolve purrscription.ru:443:37.140.192.187 -k -I -X POST https://purrscription.ru/api/auth/login -H "Content-Type: application/json" 2>&1',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:100], "===")
    _, o, _ = c.exec_command(cmd, timeout=40)
    print(o.read().decode("utf-8", "replace"))
c.close()
