import asyncio
import time
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request

from app.auth.jwt_utils import decode_access_token
from digest.config import settings

_digest_rate_buckets: dict[str, list[float]] = defaultdict(list)
_digest_rate_lock = asyncio.Lock()


@dataclass(frozen=True)
class TokenUser:
    id: str
    username: str


def auth_legacy_user_id() -> str:
    s = (settings.auth_legacy_user_id or "").strip()
    return s if s else "__legacy__"


def parse_bearer(authorization: str | None) -> str | None:
    raw = (authorization or "").strip()
    if not raw.lower().startswith("bearer "):
        return None
    t = raw[7:].strip()
    return t if t else None


async def optional_token_user(
    authorization: str | None = Header(None),
) -> TokenUser | None:
    if not settings.auth_enabled or not (settings.auth_jwt_secret or "").strip():
        return None
    tok = parse_bearer(authorization)
    if not tok:
        return None
    try:
        uid, uname = decode_access_token(tok)
        return TokenUser(id=uid, username=uname)
    except Exception:
        return None


async def require_user_when_auth_enabled(
    user: TokenUser | None = Depends(optional_token_user),
) -> TokenUser | None:
    """Если AUTH_ENABLED — требует валидный JWT; иначе None (общий legacy-режим)."""
    if not settings.auth_enabled:
        return None
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Требуется авторизация: Authorization: Bearer <токен>.",
        )
    return user


def resolve_periodic_user_id(
    authorization: str | None,
    x_internal_key: str | None,
    x_acting_user_id: str | None,
) -> str:
    """Пользователь для снимков при POST /digests/periodic и расписаниях: JWT или X-Internal-Key + X-Acting-User-Id."""
    legacy = auth_legacy_user_id()
    tok = parse_bearer(authorization)
    if tok and (settings.auth_jwt_secret or "").strip():
        try:
            uid, _ = decode_access_token(tok)
            return uid
        except Exception:
            if settings.auth_enabled:
                raise HTTPException(status_code=401, detail="Недействительный токен.") from None

    expected = (settings.monthly_digest_cron_secret or "").strip()
    if expected:
        if (x_internal_key or "").strip() != expected:
            raise HTTPException(status_code=401, detail="Неверный или отсутствует X-Internal-Key.")
        aid = (x_acting_user_id or "").strip()
        return aid if aid else legacy

    if settings.auth_enabled:
        raise HTTPException(
            status_code=401,
            detail="Требуется Bearer-токен или задайте MONTHLY_DIGEST_CRON_SECRET для ключа.",
        )
    return legacy


def resolve_schedule_list_scope(
    authorization: str | None,
    x_internal_key: str | None,
    x_acting_user_id: str | None,
) -> str | None:
    """None — все расписания (секрет); str — только пользователь JWT."""
    tok = parse_bearer(authorization)
    if tok and (settings.auth_jwt_secret or "").strip():
        try:
            uid, _ = decode_access_token(tok)
            return uid
        except Exception:
            if settings.auth_enabled:
                raise HTTPException(status_code=401, detail="Недействительный токен.") from None

    expected = (settings.monthly_digest_cron_secret or "").strip()
    if expected:
        if (x_internal_key or "").strip() != expected:
            raise HTTPException(status_code=401, detail="Неверный или отсутствует X-Internal-Key.")
        return None

    if settings.auth_enabled:
        raise HTTPException(
            status_code=401,
            detail="Требуется Bearer или MONTHLY_DIGEST_CRON_SECRET.",
        )
    return None


def resolve_trends_reader_user_id(authorization: str | None) -> str | None:
    """None — все профили (без AUTH); str — снимки одного пользователя."""
    tok = parse_bearer(authorization)
    if tok and (settings.auth_jwt_secret or "").strip():
        try:
            uid, _ = decode_access_token(tok)
            return uid
        except Exception:
            if settings.auth_enabled:
                raise HTTPException(status_code=401, detail="Недействительный токен.") from None
    if settings.auth_enabled:
        raise HTTPException(status_code=401, detail="Требуется Bearer-токен.")
    return None


async def verify_digest_rate_limit(request: Request) -> None:
    limit = int(settings.digest_rate_limit_per_minute or 0)
    if limit <= 0:
        return
    client = request.client
    key = (client.host if client else None) or "unknown"
    window = 60.0
    now = time.time()
    async with _digest_rate_lock:
        bucket = _digest_rate_buckets[key]
        bucket[:] = [t for t in bucket if now - t < window]
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов к /digests. Повторите позже.",
            )
        bucket.append(now)


def verify_monthly_cron_secret(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> None:
    expected = (settings.monthly_digest_cron_secret or "").strip()
    if not expected:
        return
    got = (x_internal_key or "").strip()
    if got != expected:
        raise HTTPException(status_code=401, detail="Неверный или отсутствует X-Internal-Key.")


verify_internal_cron_secret = verify_monthly_cron_secret


async def llm_client_override_dependency(
    x_kamgu_llm_key: str | None = Header(default=None, alias="X-Kamgu-Llm-Key"),
    x_kamgu_llm_base_url: str | None = Header(default=None, alias="X-Kamgu-Llm-Base-Url"),
    x_kamgu_llm_model: str | None = Header(default=None, alias="X-Kamgu-Llm-Model"),
    x_kamgu_llm_json_mode: str | None = Header(default=None, alias="X-Kamgu-Llm-Json-Mode"),
) -> AsyncIterator[None]:
    """Опциональный BYOK: ключ/URL/модель в заголовках для POST /digests и /digests/periodic."""
    from digest.llm_override import LLMRequestOverride, push_llm_override, reset_llm_override

    token = None
    try:
        if x_kamgu_llm_key and x_kamgu_llm_key.strip():
            jm: bool | None = None
            if x_kamgu_llm_json_mode is not None and str(x_kamgu_llm_json_mode).strip():
                jm = str(x_kamgu_llm_json_mode).strip().lower() in ("1", "true", "yes", "on")
            ov = LLMRequestOverride(
                api_key=x_kamgu_llm_key.strip(),
                base_url=x_kamgu_llm_base_url.strip() if x_kamgu_llm_base_url and x_kamgu_llm_base_url.strip() else None,
                model=x_kamgu_llm_model.strip() if x_kamgu_llm_model and x_kamgu_llm_model.strip() else None,
                json_mode=jm,
            )
            token = push_llm_override(ov)
        yield
    finally:
        if token is not None:
            reset_llm_override(token)
