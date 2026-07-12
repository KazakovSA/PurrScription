#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    "getent hosts purrscription.ru || true",
    "dig +short purrscription.ru A || true",
    "dig +short purrscription.ru AAAA || true",
    "dig +short www.purrscription.ru A || true",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd, "===")
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", "replace"))
c.close()
