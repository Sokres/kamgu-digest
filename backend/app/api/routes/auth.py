from __future__ import annotations

import logging
import sqlite3

import psycopg
from fastapi import APIRouter, Body, Depends, HTTPException
from starlette.responses import Response

from app.api.deps import TokenUser, optional_token_user
from app.auth.jwt_utils import create_access_token
from app.auth.session_repo import (
    create_refresh_session,
    revoke_all_refresh_for_user,
    revoke_refresh_by_plain,
    take_refresh_session_user_id,
)
from app.auth.user_repo import (
    create_user,
    get_user_by_id,
    get_user_by_username,
    update_user_password,
    verify_password,
)
from digest.config import settings
from digest.models import (
    AuthChangePasswordRequest,
    AuthLoginRequest,
    AuthLogoutRequest,
    AuthMeResponse,
    AuthRefreshRequest,
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
            refresh = create_refresh_session(conn, u.id)
            access = create_access_token(u.id, u.username)
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth register DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    return AuthTokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=u.id,
        username=u.username,
    )


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
            refresh = create_refresh_session(conn, u.id)
            access = create_access_token(u.id, u.username)
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth login DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    return AuthTokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=u.id,
        username=u.username,
    )


@router.post("/auth/refresh", response_model=AuthTokenResponse)
def auth_refresh(body: AuthRefreshRequest) -> AuthTokenResponse:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="AUTH_ENABLED=false.")
    if not (settings.auth_jwt_secret or "").strip():
        raise HTTPException(status_code=503, detail="Задайте AUTH_JWT_SECRET в .env.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            uid = take_refresh_session_user_id(conn, body.refresh_token)
            if not uid:
                raise HTTPException(status_code=401, detail="Недействителен или истёк refresh-токен.")
            row = get_user_by_id(conn, uid)
            if not row:
                raise HTTPException(status_code=401, detail="Пользователь не найден.")
            refresh = create_refresh_session(conn, row.id)
            access = create_access_token(row.id, row.username)
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth refresh DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    return AuthTokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=row.id,
        username=row.username,
    )


@router.post("/auth/logout", status_code=204)
def auth_logout(
    user: TokenUser | None = Depends(optional_token_user),
    body: AuthLogoutRequest | None = Body(None),
) -> Response:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="AUTH_ENABLED=false.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if user is not None:
                revoke_all_refresh_for_user(conn, user.id)
            else:
                rt = (body.refresh_token if body and body.refresh_token else "") or ""
                if rt.strip():
                    revoke_refresh_by_plain(conn, rt.strip())
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth logout DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e
    return Response(status_code=204)


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


@router.post("/auth/change-password", status_code=204)
def auth_change_password(
    body: AuthChangePasswordRequest,
    user: TokenUser | None = Depends(optional_token_user),
) -> Response:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Смена пароля отключена (AUTH_ENABLED=false).")
    if not (settings.auth_jwt_secret or "").strip():
        raise HTTPException(status_code=503, detail="Задайте AUTH_JWT_SECRET в .env.")
    if user is None:
        raise HTTPException(status_code=401, detail="Требуется авторизация: Bearer <токен>.")
    ok = False
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = get_user_by_id(conn, user.id)
            if not row:
                raise HTTPException(status_code=401, detail="Пользователь не найден.")
            if not verify_password(body.current_password, row.password_hash):
                raise HTTPException(status_code=401, detail="Неверный текущий пароль.")
            ok = update_user_password(conn, user.id, body.new_password)
            revoke_all_refresh_for_user(conn, user.id)
    except HTTPException:
        raise
    except (sqlite3.Error, psycopg.Error, OSError, ValueError) as e:
        logger.warning("auth change-password DB error: %s", e)
        raise HTTPException(status_code=503, detail="База данных недоступна.") from e

    if not ok:
        raise HTTPException(status_code=500, detail="Не удалось обновить пароль.")
    return Response(status_code=204)
