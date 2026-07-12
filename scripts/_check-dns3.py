#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    'curl -sS -m 5 -k -o /dev/null -w "old_https_health:%{http_code}\\n" https://37.140.192.187/api/health || echo old_https_fail',
    'curl -sS -m 5 -k -I https://37.140.192.187/login 2>&1 | head -15',
    'curl -sS -m 5 -k -o /dev/null -w "old_https_login:%{http_code}\\n" -X POST https://37.140.192.187/api/auth/login -H "Content-Type: application/json" -d \'{"email":"x","password":"y"}\' || echo fail',
    'curl -sS -m 5 -o /dev/null -w "domain_http:%{http_code}\\n" http://purrscription.ru/api/health',
    'curl -sS -m 5 -k -o /dev/null -w "domain_https:%{http_code}\\n" https://purrscription.ru/api/health || echo domain_https_fail',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:100], "===")
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", "replace"))
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err.strip())
c.close()
