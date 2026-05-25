"""Встроенный планировщик APScheduler для POST /digests/schedules (один процесс uvicorn)."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

_UTC = ZoneInfo("UTC")

from digest.config import settings
from digest.models import MonthlyDigestRequest
from digest.notify_email import send_schedule_digest_notification
from digest.schedule_webhook import post_schedule_run_webhook
from digest.schedule_run_store import insert_schedule_run
from digest.schedule_store import (
    fetch_schedule_row_for_job,
    load_enabled_schedules,
    update_last_run,
)
from digest.snapshot_store import init_snapshot_schema, snapshot_connection

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def validate_cron_utc(expr: str) -> str:
    s = " ".join(expr.split())
    parts = s.split()
    if len(parts) != 5:
        raise ValueError(
            "cron_utc: нужно 5 полей в UTC (минута час день_месяца месяц день_недели), например «0 6 1 * *»"
        )
    CronTrigger.from_crontab(s, timezone=_UTC)
    return s


def scheduler_running() -> bool:
    return _scheduler is not None and _scheduler.running


def _log_schedule_run(schedule_id: str, user_id: str, status: str, message: str | None) -> None:
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            insert_schedule_run(conn, schedule_id, user_id, status, message)
    except Exception:
        logger.exception("Schedule %s: failed to append run log", schedule_id)


async def _notify_schedule_email(subject: str, body: str) -> None:
    await asyncio.to_thread(send_schedule_digest_notification, subject=subject, body=body)


async def _run_scheduled_digest(schedule_id: str) -> None:
    from pipeline.run_monthly import run_monthly_digest

    owner_user_id = ""
    profile_id = ""

    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            row = fetch_schedule_row_for_job(conn, schedule_id)
            if not row:
                logger.warning("Schedule %s not found, skip", schedule_id)
                return
            _sid, owner_user_id, profile_id, enabled, _cron, params = row
            if not enabled:
                logger.debug("Schedule %s disabled, skip", schedule_id)
                return
            req = MonthlyDigestRequest(
                profile_id=profile_id,
                topic_queries=params.topic_queries,
                digest_mode=params.digest_mode,
                web_scholarly_sources_only=params.web_scholarly_sources_only,
                web_search_additional_terms=params.web_search_additional_terms,
                max_candidates=params.max_candidates,
                top_n_for_llm=params.top_n_for_llm,
                trend_top_k=params.trend_top_k,
                from_year=params.from_year,
                to_year=params.to_year,
                exclude_dois=params.exclude_dois,
                force_period=None,
                fetch_oa_fulltext=params.fetch_oa_fulltext,
                deep_digest=params.deep_digest,
            )
    except Exception:
        logger.exception("Schedule %s: failed before pipeline", schedule_id)
        try:
            with snapshot_connection(settings.snapshot_database_url) as conn:
                init_snapshot_schema(conn)
                update_last_run(conn, schedule_id, "error", "failed before pipeline (see logs)")
        except Exception:
            logger.exception("Schedule %s: failed to write error status", schedule_id)
        _log_schedule_run(
            schedule_id,
            owner_user_id or "__unknown__",
            "error",
            "failed before pipeline (see logs)",
        )
        await post_schedule_run_webhook(
            schedule_id=schedule_id,
            profile_id=profile_id or "",
            user_id=owner_user_id or "__unknown__",
            status="error",
            message="failed before pipeline (see logs)",
        )
        await _notify_schedule_email(
            f"[KamGU Digest] Ошибка до пайплайна · {schedule_id}",
            f"schedule_id={schedule_id}\nprofile_id={profile_id or '—'}\nСтатус: failed before pipeline",
        )
        return

    try:
        await run_monthly_digest(req, user_id=owner_user_id)
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            update_last_run(conn, schedule_id, "ok", None)
        logger.info("Scheduled digest finished: %s profile=%s", schedule_id, profile_id)
        _log_schedule_run(schedule_id, owner_user_id, "ok", None)
        await post_schedule_run_webhook(
            schedule_id=schedule_id,
            profile_id=profile_id,
            user_id=owner_user_id,
            status="ok",
            message=None,
        )
        await _notify_schedule_email(
            f"[KamGU Digest] ОК · {profile_id}",
            f"schedule_id={schedule_id}\nprofile_id={profile_id}\nСтатус: ok",
        )
    except Exception as e:
        msg = str(e)[:4000]
        logger.exception("Scheduled digest failed: %s", schedule_id)
        try:
            with snapshot_connection(settings.snapshot_database_url) as conn:
                init_snapshot_schema(conn)
                update_last_run(conn, schedule_id, "error", msg)
        except Exception:
            logger.exception("Schedule %s: failed to write error status", schedule_id)
        _log_schedule_run(schedule_id, owner_user_id, "error", msg)
        await post_schedule_run_webhook(
            schedule_id=schedule_id,
            profile_id=profile_id,
            user_id=owner_user_id,
            status="error",
            message=msg,
        )
        await _notify_schedule_email(
            f"[KamGU Digest] Ошибка · {profile_id}",
            f"schedule_id={schedule_id}\nprofile_id={profile_id}\nСтатус: error\n\n{msg}",
        )


def _sync_jobs_from_db() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.remove_all_jobs()
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        pairs = load_enabled_schedules(conn)
    for sid, cron in pairs:
        try:
            cron_s = validate_cron_utc(cron)
        except Exception as e:
            logger.error("Invalid cron for schedule %s: %s — %s", sid, cron, e)
            continue
        _scheduler.add_job(
            _run_scheduled_digest,
            trigger=CronTrigger.from_crontab(cron_s, timezone=_UTC),
            args=[sid],
            id=f"digest_schedule_{sid}",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        logger.info("Registered digest schedule %s cron=%s UTC", sid, cron_s)


def reload_schedules() -> None:
    """Перечитать БД и пересобрать задачи (после CRUD)."""
    if not settings.digest_periodic_scheduler_enabled:
        return
    try:
        _sync_jobs_from_db()
    except Exception:
        logger.exception("reload_schedules failed")


def start_periodic_scheduler() -> None:
    global _scheduler
    if not settings.digest_periodic_scheduler_enabled:
        logger.info("Digest periodic scheduler disabled (DIGEST_PERIODIC_SCHEDULER_ENABLED=false)")
        return
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone=_UTC)
    _sync_jobs_from_db()
    _scheduler.start()
    logger.info("Digest periodic scheduler started (single uvicorn worker recommended)")


def shutdown_periodic_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Digest periodic scheduler stopped")
