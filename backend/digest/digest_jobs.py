"""Фоновые задачи POST /digests — короткие poll-запросы вместо одного долгого HTTP."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

from fastapi import HTTPException

from digest.llm_override import LLMRequestOverride, push_llm_override, reset_llm_override
from digest.models import DigestRequest, DigestResponse
from app.services.digest_http import execute_digest

logger = logging.getLogger(__name__)

DigestJobState = Literal["queued", "running", "done", "failed"]

_JOB_TTL_SECONDS = 2 * 3600
_MAX_JOBS = 120


@dataclass
class DigestJobRecord:
    id: str
    status: DigestJobState
    owner_user_id: str | None
    created_at: float
    started_at: float | None = None
    finished_at: float | None = None
    error: str | None = None
    error_status: int | None = None
    result: DigestResponse | None = None
    task: asyncio.Task[None] | None = field(default=None, repr=False)


_jobs: dict[str, DigestJobRecord] = {}
_lock = asyncio.Lock()


def capture_llm_override() -> LLMRequestOverride | None:
    from digest.llm_override import _llm_override

    return _llm_override.get()


def _purge_old_jobs(now: float) -> None:
    if len(_jobs) <= _MAX_JOBS:
        expired = [jid for jid, job in _jobs.items() if now - job.created_at > _JOB_TTL_SECONDS]
        for jid in expired:
            job = _jobs.pop(jid, None)
            if job and job.task and not job.task.done():
                job.task.cancel()


async def _run_digest_job(
    job_id: str,
    body: DigestRequest,
    document_user_id: str | None,
    llm_override: LLMRequestOverride | None,
) -> None:
    job = _jobs.get(job_id)
    if job is None:
        return
    job.status = "running"
    job.started_at = time.time()
    token = None
    if llm_override is not None:
        token = push_llm_override(llm_override)
    try:
        job.result = await execute_digest(body, document_user_id=document_user_id)
        job.status = "done"
    except HTTPException as exc:
        job.status = "failed"
        detail = exc.detail
        job.error = detail if isinstance(detail, str) else str(detail)
        job.error_status = exc.status_code
    except asyncio.CancelledError:
        job.status = "failed"
        job.error = "Задача отменена."
        job.error_status = 499
        raise
    except Exception:
        logger.exception("Digest job %s failed", job_id)
        job.status = "failed"
        job.error = "Внутренняя ошибка при формировании дайджеста. Подробности в логах сервера."
        job.error_status = 502
    finally:
        if token is not None:
            reset_llm_override(token)
        job.finished_at = time.time()


async def start_digest_job(
    body: DigestRequest,
    document_user_id: str | None,
    llm_override: LLMRequestOverride | None,
) -> DigestJobRecord:
    now = time.time()
    async with _lock:
        _purge_old_jobs(now)
        job_id = str(uuid.uuid4())
        job = DigestJobRecord(
            id=job_id,
            status="queued",
            owner_user_id=document_user_id,
            created_at=now,
        )
        _jobs[job_id] = job
    job.task = asyncio.create_task(
        _run_digest_job(job_id, body, document_user_id, llm_override),
        name=f"digest-job-{job_id[:8]}",
    )
    return job


def get_digest_job(job_id: str, request_user_id: str | None) -> DigestJobRecord | None:
    job = _jobs.get(job_id)
    if job is None:
        return None
    if job.owner_user_id is not None and job.owner_user_id != request_user_id:
        return None
    return job


def job_elapsed_seconds(job: DigestJobRecord) -> float | None:
    if job.started_at is None:
        return None
    end = job.finished_at if job.finished_at is not None else time.time()
    return round(end - job.started_at, 3)
