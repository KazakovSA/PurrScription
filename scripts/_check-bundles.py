#!/usr/bin/env python3
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
cmds = [
    # Which index.html / bundle does the NEW VDS serve now?
    'curl -sS -m 8 http://127.0.0.1/ | grep -oE "index-[A-Za-z0-9_-]+\\.(js|css)"',
    # Does the freshly built CSS still contain the orange handle gradient?
    'docker exec purrscription-web-1 sh -c "grep -c \'c6682c\' /usr/share/nginx/html/assets/index-*.css || true"',
    'docker exec purrscription-web-1 sh -c "grep -c \'33332f\' /usr/share/nginx/html/assets/index-*.css || true"',
    # Which bundle does the OLD hosting (reg.ru) serve?
    'curl -sS -m 8 --resolve purrscription.ru:443:37.140.192.187 -k https://purrscription.ru/ | grep -oE "index-[A-Za-z0-9_-]+\\.(js|css)"',
    'curl -sS -m 8 --resolve purrscription.ru:443:37.140.192.187 -k https://purrscription.ru/assets/index-B0ToRpJO.css 2>/dev/null | grep -c "c6682c" || true',
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
for cmd in cmds:
    print("===", cmd[:95], "===")
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", "replace")
    print(out.strip() or "(empty)")
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR:", err.strip()[:300])
c.close()
