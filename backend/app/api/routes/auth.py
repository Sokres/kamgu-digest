from __future__ import annotations

import logging
import sqlite3

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import TokenUser, optional_token_user
from app.auth.jwt_utils import create_access_token
from app.auth.user_repo import create_user, get_user_by_id, get_user_by_username, verify_password
from digest.config import settings
from digest.models import (
    AuthLoginRequest,
    AuthMeResponse,
    AuthRegisterRequest,
    AuthStatusResponse,
    AuthTokenResponse,
)
from digest.snapshot_store import init_snapshot_schema, snapshot_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


@router.get("/auth/status", response_model=AuthStatusResponse)
def auth_status() -> AuthStatusResponse:
    return AuthStatusResponse(
        auth_enabled=bool(settings.auth_enabled),
        registration_enabled=bool(settings.auth_registration_enabled),
    )


@router.post("/auth/register", response_model=AuthTokenResponse)
def auth_register(body: AuthRegisterRequest) -> AuthTokenResponse:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Регистрация отключена (AUTH_ENABLED=false).")
    if not (settings.auth_jwt_secret or "").strip():
        raise HTTPException(status_code=503, detail="Задайте AUTH_JWT_SECRET в .env.")
    if not settings.auth_registration_enabled:
        raise HTTPException(status_code=403, detail="Регистрация закрыта (AUTH_REGISTRATION_ENABLED=false).")
    uname = body.username.strip().lower()
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if get_user_by_username(conn, uname):
                raise HTTPException(status_code=409, detail="Такое имя уже занято.")
            u = create_user(conn, uname, body.password)
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth register DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    token = create_access_token(u.id, u.username)
    return AuthTokenResponse(access_token=token, user_id=u.id, username=u.username)


@router.post("/auth/login", response_model=AuthTokenResponse)
def auth_login(body: AuthLoginRequest) -> AuthTokenResponse:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Вход отключён (AUTH_ENABLED=false).")
    if not (settings.auth_jwt_secret or "").strip():
        raise HTTPException(status_code=503, detail="Задайте AUTH_JWT_SECRET в .env.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            u = get_user_by_username(conn, body.username.strip().lower())
            if not u or not verify_password(body.password, u.password_hash):
                raise HTTPException(status_code=401, detail="Неверное имя или пароль.")
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth login DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    token = create_access_token(u.id, u.username)
    return AuthTokenResponse(access_token=token, user_id=u.id, username=u.username)


@router.get("/auth/me", response_model=AuthMeResponse)
def auth_me(user: TokenUser | None = Depends(optional_token_user)) -> AuthMeResponse:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="AUTH_ENABLED=false.")
    if user is None:
        raise HTTPException(status_code=401, detail="Нет или недействителен токен.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = get_user_by_id(conn, user.id)
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth me DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e
    if not row:
        raise HTTPException(status_code=401, detail="Пользователь не найден.")
    return AuthMeResponse(user_id=row.id, username=row.username)
