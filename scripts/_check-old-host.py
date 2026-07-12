#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS -m 5 -I http://37.140.192.187/ 2>&1 | head -20',
    'curl -sS -m 5 http://37.140.192.187/ 2>&1 | head -5',
    'curl -sS -m 5 -I http://37.140.192.187/login 2>&1 | head -15',
    'curl -sS -m 5 http://37.140.192.187/login 2>&1 | head -8',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd, "===")
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", "replace"))
c.close()
