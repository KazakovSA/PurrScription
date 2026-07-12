#!/usr/bin/env python3
"""Reset hauras@gmail.com password on VDS."""
import paramiko

HOST, USER, PASS = "185.212.148.223", "root", "mYKUPTnm6qEm"
NEW_PASSWORD = "Purr2026!"

script = f"""
import asyncio
from sqlalchemy import select
from api.auth import hash_password
from api.database import async_session_factory
from api.models import User

async def main() -> None:
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email == "hauras@gmail.com"))
        user = result.scalar_one_or_none()
        if not user:
            print("USER_NOT_FOUND")
            return
        user.password_hash = hash_password("{NEW_PASSWORD}")
        await db.commit()
        print("OK", user.email, user.role)

asyncio.run(main())
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=60)
sftp = c.open_sftp()
with sftp.file("/tmp/reset_pw.py", "w") as f:
    f.write(script)
sftp.close()
_, o, e = c.exec_command(
    "docker cp /tmp/reset_pw.py purrscription-api-1:/tmp/reset_pw.py && "
    "docker exec purrscription-api-1 python /tmp/reset_pw.py",
    timeout=60,
)
out = o.read().decode("utf-8", "replace")
err = e.read().decode("utf-8", "replace")
print(out or err)
c.close()
