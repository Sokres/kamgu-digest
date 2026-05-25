"""HTTP callback после завершения запуска по расписанию (опционально)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from digest.config import settings

logger = logging.getLogger(__name__)


async def post_schedule_run_webhook(
    *,
    schedule_id: str,
    profile_id: str,
    user_id: str,
    status: str,
    message: str | None,
) -> None:
    url = (settings.digest_schedule_webhook_url or "").strip()
    if not url:
        return
    payload = {
        "event": "digest_schedule_run",
        "schedule_id": schedule_id,
        "profile_id": profile_id,
        "user_id": user_id,
        "status": status,
        "message": (message or "")[:8000],
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    headers: dict[str, str] = {}
    sec = (settings.digest_schedule_webhook_secret or "").strip()
    if sec:
        headers["X-Webhook-Secret"] = sec
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        logger.info("schedule webhook ok: %s %s", schedule_id, status)
    except Exception:
        logger.exception("schedule webhook failed for %s", schedule_id)
