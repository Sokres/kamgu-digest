"""Сохранённые разовые дайджесты (POST /digests) в БД снимков."""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import Response

from digest.config import settings
from digest.docx_export import saved_digest_to_docx_bytes
from digest.models import (
    SavedDigestCreate,
    SavedDigestCreated,
    SavedDigestEnvelope,
    SavedDigestListItem,
    SavedDigestOut,
    SavedDigestShareResponse,
)
from digest.saved_digest_store import (
    delete_saved_digest,
    ensure_saved_digest_share,
    get_saved_digest_row,
    insert_saved_digest,
    list_saved_digests_for_user,
    revoke_saved_digest_share,
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
    for sid, title, created_at, payload_json, has_share in rows:
        try:
            env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
            m = env.resolved_digest_response().meta
            out.append(
                SavedDigestListItem(
                    id=sid,
                    title=title,
                    created_at=created_at,
                    digest_mode=m.digest_mode,
                    used_for_llm=m.used_for_llm,
                    elapsed_seconds=m.elapsed_seconds,
                    public_share_active=has_share,
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
                    public_share_active=has_share,
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
    sid, title, created_at, payload_json, share_tok = row
    try:
        env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
    except Exception as e:
        logger.exception("saved_digest corrupt payload %s", sid)
        raise HTTPException(status_code=500, detail="Повреждённые данные записи.") from e

    return SavedDigestOut(
        id=sid,
        title=title,
        created_at=created_at,
        digest_response=env.resolved_digest_response(),
        monthly_digest=env.monthly_digest,
        request_snapshot=env.request,
        monthly_request_snapshot=env.monthly_request,
        public_share_active=bool(share_tok),
    )


def _docx_download_filename(title: str, digest_id: str) -> tuple[str, str]:
    """ASCII fallback для filename= и RFC5987 filename*= для Unicode."""
    raw = (title or "").strip() or f"digest-{digest_id}"
    stem = re.sub(r"[^\w.\-]+", "_", raw, flags=re.UNICODE).strip("._") or "digest"
    stem = stem[:120]
    ascii_name = f"{stem}.docx"
    utf8_star = quote(f"{raw[:180]}.docx", safe="")
    cd = f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_star}'
    return ascii_name, cd


@router.get("/saved-digests/{digest_id}/export/docx")
async def export_saved_digest_docx(
    digest_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> Response:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = get_saved_digest_row(conn, uid, digest_id)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests docx DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    if not row:
        raise HTTPException(status_code=404, detail="Сохранённый дайджест не найден.")
    sid, title, created_at, payload_json, _share_tok = row
    try:
        env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
    except Exception as e:
        logger.exception("saved_digest docx corrupt payload %s", sid)
        raise HTTPException(status_code=500, detail="Повреждённые данные записи.") from e

    tq = env.request.topic_queries if env.request else None
    resp = env.resolved_digest_response()
    buf = saved_digest_to_docx_bytes(title, created_at, resp, tq)
    data = buf.getvalue()
    _ascii_fn, cd = _docx_download_filename(title, sid)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": cd},
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

    digest_response = body.digest_response
    if digest_response is None and body.monthly_digest is not None:
        m = body.monthly_digest
        digest_response = SavedDigestEnvelope(
            digest_response=None,
            monthly_digest=m,
        ).resolved_digest_response()
    env = SavedDigestEnvelope(
        digest_response=digest_response,
        monthly_digest=body.monthly_digest,
        request=body.request_snapshot,
        monthly_request=body.monthly_request_snapshot,
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


@router.post(
    "/saved-digests/{digest_id}/share",
    response_model=SavedDigestShareResponse,
)
async def create_or_get_share_link(
    digest_id: str,
    rotate: bool = Query(
        False,
        description="Если true — новый токен; прежняя публичная ссылка перестаёт работать.",
    ),
    _: None = Depends(verify_digest_rate_limit),
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> SavedDigestShareResponse:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            try:
                token = ensure_saved_digest_share(conn, uid, digest_id, rotate=rotate)
            except KeyError:
                raise HTTPException(status_code=404, detail="Сохранённый дайджест не найден.") from None
    except (OSError, ValueError) as e:
        logger.warning("saved_digests share DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    return SavedDigestShareResponse(
        token=token,
        public_path=f"/public/saved-digests/{token}",
    )


@router.delete("/saved-digests/{digest_id}/share", status_code=204)
async def remove_share_link(
    digest_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> Response:
    uid = _resolve_saved_digest_user_id(auth_user)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            ok = revoke_saved_digest_share(conn, uid, digest_id)
    except (OSError, ValueError) as e:
        logger.warning("saved_digests revoke share DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    if not ok:
        raise HTTPException(status_code=404, detail="Сохранённый дайджест не найден.")
    return Response(status_code=204)


@router.delete("/saved-digests/{digest_id}", status_code=204)
async def remove_saved_digest(
    digest_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> Response:
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
    return Response(status_code=204)
