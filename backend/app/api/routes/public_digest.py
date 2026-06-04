"""Публичное чтение сохранённого дайджеста по share_token (без JWT)."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from digest.config import settings
from digest.models import SavedDigestEnvelope, SavedDigestOut
from digest.saved_digest_store import get_saved_digest_by_share_token
from digest.snapshot_store import init_snapshot_schema, snapshot_connection
from app.api.deps import verify_digest_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["public"])


@router.get("/public/saved-digests/{token}", response_model=SavedDigestOut)
async def get_public_saved_digest(
    token: str,
    _: None = Depends(verify_digest_rate_limit),
) -> SavedDigestOut:
    t = (token or "").strip()
    if not t:
        raise HTTPException(status_code=404, detail="Ссылка недействительна.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = get_saved_digest_by_share_token(conn, t)
    except (OSError, ValueError) as e:
        logger.warning("public saved digest DB error: %s", e)
        raise HTTPException(status_code=503, detail="База снимков недоступна.") from e

    if not row:
        raise HTTPException(status_code=404, detail="Ссылка недействительна или отозвана.")

    sid, title, created_at, payload_json = row
    try:
        env = SavedDigestEnvelope.model_validate(json.loads(payload_json))
    except Exception as e:
        logger.exception("public saved digest corrupt %s", sid)
        raise HTTPException(status_code=500, detail="Повреждённые данные записи.") from e

    return SavedDigestOut(
        id=sid,
        title=title,
        created_at=created_at,
        digest_response=env.resolved_digest_response(),
        monthly_digest=env.monthly_digest,
        request_snapshot=env.request,
        monthly_request_snapshot=env.monthly_request,
        public_share_active=True,
    )
