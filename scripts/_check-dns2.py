#!/usr/bin/env python3
import socket
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"

print("Local DNS resolution:")
for name in ["purrscription.ru", "www.purrscription.ru"]:
    try:
        infos = socket.getaddrinfo(name, 80, proto=socket.IPPROTO_TCP)
        addrs = sorted({i[4][0] for i in infos})
        print(f"  {name}: {addrs}")
    except Exception as exc:
        print(f"  {name}: ERROR {exc}")

cmds = [
    'curl -sS -m 5 -o /dev/null -w "old_ip:%{http_code}\\n" http://37.140.192.187/api/health || echo old_fail',
    'curl -sS -m 5 -o /dev/null -w "vds_ip:%{http_code}\\n" http://185.212.148.223/api/health || echo vds_fail',
    'curl -sS -m 5 -H "Host: purrscription.ru" -o /dev/null -w "host_header:%{http_code}\\n" http://185.212.148.223/api/health || echo host_fail',
    'curl -sS -m 5 -X POST http://37.140.192.187/api/auth/login -H "Content-Type: application/json" -d \'{"email":"x","password":"y"}\' -w "\\nold_login:%{http_code}\\n" || echo old_login_fail',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:95], "===")
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err.strip())
c.close()
