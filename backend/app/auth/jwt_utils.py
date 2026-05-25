from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from digest.config import settings


def create_access_token(user_id: str, username: str) -> str:
    secret = (settings.auth_jwt_secret or "").strip()
    if not secret:
        raise RuntimeError("auth_jwt_secret не задан")
    if settings.auth_access_token_expire_minutes is not None:
        minutes = max(5, int(settings.auth_access_token_expire_minutes))
    else:
        minutes = max(5, int(settings.auth_jwt_expire_minutes or 10080))
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=minutes)
    payload = {
        "sub": user_id,
        "u": username,
        "exp": exp,
        "iat": int(now.timestamp()),
        "jti": str(uuid.uuid4()),
        "typ": "access",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str) -> tuple[str, str]:
    secret = (settings.auth_jwt_secret or "").strip()
    if not secret:
        raise jwt.InvalidTokenError("secret missing")
    data = jwt.decode(token, secret, algorithms=["HS256"])
    typ = data.get("typ")
    if typ is not None and str(typ) != "access":
        raise jwt.InvalidTokenError("wrong token type")
    uid = str(data.get("sub") or "").strip()
    uname = str(data.get("u") or "").strip()
    if not uid:
        raise jwt.InvalidTokenError("no sub")
    return uid, uname
