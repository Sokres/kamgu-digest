"""Сохранённые разовые дайджесты (POST /digests) в БД снимков."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from digest.config import settings
from digest.models import (
    SavedDigestCreate,
    SavedDigestCreated,
    SavedDigestEnvelope,
    SavedDigestListItem,
    SavedDigestOut,
)
from digest.saved_digest_store import (
    delete_saved_digest,
    get_saved_digest_row,
    insert_saved_digest,
    list_saved_digests_for_user,
)
from digest.snapshot_store import init_snapshot_schema, snapshot_connection
from app.api.deps import TokenUser, auth_legacy_user_id, require_user_when_auth_enabled, verify_digest_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["saved-digests"])


def _resolve_saved_digest_user_id(auth_user: TokenUser | None) -> str:
    if auth_user:
        return auth_user.id
    return auth_legacy_user_id()


@router.get("/saved-digests", response_model=list[SavedDigestListItem])
async def list_saved_digests(
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> list[SavedDigestListItem]:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            rows = list_saved_digests_for_user(conn, uid)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests list DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    out: list[SavedDigestListItem] = []
    for sid, title, created_at, payload_json in rows:
        try:
            env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
            m = env.digest_response.meta
            out.append(
                SavedDigestListItem(
                    id=sid,
                    title=title,
                    created_at=created_at,
                    digest_mode=m.digest_mode,
                    used_for_llm=m.used_for_llm,
                    elapsed_seconds=m.elapsed_seconds,
                )
            )
        except Exception as e:
            logger.warning("saved_digest list skip bad row %s: %s", sid, e)
            out.append(
                SavedDigestListItem(
                    id=sid,
                    title=title,
                    created_at=created_at,
                    digest_mode="peer_reviewed",
                    used_for_llm=None,
                    elapsed_seconds=None,
                )
            )
    return out


@router.get("/saved-digests/{digest_id}", response_model=SavedDigestOut)
async def get_saved_digest(
    digest_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> SavedDigestOut:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = get_saved_digest_row(conn, uid, digest_id)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests get DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    if not row:
        raise HTTPException(status_code=404, detail="Сохранённый дайджест не найден.")
    sid, title, created_at, payload_json = row
    try:
        env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
    except Exception as e:
        logger.exception("saved_digest corrupt payload %s", sid)
        raise HTTPException(status_code=500, detail="Повреждённые данные записи.") from e

    return SavedDigestOut(
        id=sid,
        title=title,
        created_at=created_at,
        digest_response=env.digest_response,
        request_snapshot=env.request,
    )


@router.post("/saved-digests", response_model=SavedDigestCreated)
async def create_saved_digest(
    body: SavedDigestCreate,
    _: None = Depends(verify_digest_rate_limit),
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> SavedDigestCreated:
    uid = _resolve_saved_digest_user_id(auth_user)
    title_max = max(1, int(settings.saved_digest_title_max_length or 200))
    t = body.title.strip()
    if len(t) > title_max:
        raise HTTPException(
            status_code=400,
            detail=f"Название длиннее {title_max} символов.",
        )

    env = SavedDigestEnvelope(
        digest_response=body.digest_response,
        request=body.request_snapshot,
    )
    raw = env.model_dump_json()
    max_b = max(1024, int(settings.saved_digest_max_payload_bytes))
    if len(raw.encode("utf-8")) > max_b:
        raise HTTPException(
            status_code=413,
            detail="Слишком большой объём данных для сохранения.",
        )

    payload = json.loads(raw)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            sid, created_at = insert_saved_digest(conn, uid, t, payload)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests insert DB error: %s", e)
        raise HTTPException(status_code=503, detail="Не удалось записать в базу.") from e

    return SavedDigestCreated(id=sid, created_at=created_at)


@router.delete("/saved-digests/{digest_id}", status_code=204)
async def remove_saved_digest(
    digest_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> None:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            ok = delete_saved_digest(conn, uid, digest_id)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests delete DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    if not ok:
        raise HTTPException(status_code=404, detail="Сохранённый дайджест не найден.")
