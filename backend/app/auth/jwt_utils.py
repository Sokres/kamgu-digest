from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from digest.config import settings


def create_access_token(user_id: str, username: str) -> str:
    secret = (settings.auth_jwt_secret or "").strip()
    if not secret:
        raise RuntimeError("auth_jwt_secret не задан")
    exp = datetime.now(timezone.utc) + timedelta(minutes=max(5, int(settings.auth_jwt_expire_minutes or 10080)))
    payload = {"sub": user_id, "u": username, "exp": exp}
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str) -> tuple[str, str]:
    secret = (settings.auth_jwt_secret or "").strip()
    if not secret:
        raise jwt.InvalidTokenError("secret missing")
    data = jwt.decode(token, secret, algorithms=["HS256"])
    uid = str(data.get("sub") or "").strip()
    uname = str(data.get("u") or "").strip()
    if not uid:
        raise jwt.InvalidTokenError("no sub")
    return uid, uname
