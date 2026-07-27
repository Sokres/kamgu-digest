import asyncio

import pytest
from fastapi import HTTPException

from digest.digest_jobs import get_digest_job, start_digest_job
from digest.models import DigestRequest, DigestResponse


def test_digest_job_completes(monkeypatch) -> None:
    async def fake_execute(body: DigestRequest, document_user_id: str | None = None) -> DigestResponse:
        await asyncio.sleep(0.05)
        return DigestResponse(
            publications_used=[],
            article_cards=[],
            digest_ru="ru",
            digest_en="en",
        )

    monkeypatch.setattr("digest.digest_jobs.execute_digest", fake_execute)

    async def run() -> None:
        job = await start_digest_job(
            DigestRequest(topic_queries=["test"]),
            document_user_id="user-1",
            llm_override=None,
        )
        assert job.status == "queued"
        assert job.task is not None
        await job.task

        loaded = get_digest_job(job.id, "user-1")
        assert loaded is not None
        assert loaded.status == "done"
        assert loaded.result is not None
        assert loaded.result.digest_ru == "ru"

    asyncio.run(run())


def test_digest_job_failed_maps_http_exception(monkeypatch) -> None:
    async def fake_execute(body: DigestRequest, document_user_id: str | None = None) -> DigestResponse:
        raise HTTPException(status_code=503, detail="LLM недоступен")

    monkeypatch.setattr("digest.digest_jobs.execute_digest", fake_execute)

    async def run() -> None:
        job = await start_digest_job(
            DigestRequest(topic_queries=["test"]),
            document_user_id=None,
            llm_override=None,
        )
        assert job.task is not None
        await job.task

        loaded = get_digest_job(job.id, None)
        assert loaded is not None
        assert loaded.status == "failed"
        assert loaded.error == "LLM недоступен"
        assert loaded.error_status == 503

    asyncio.run(run())


def test_digest_job_owner_mismatch() -> None:
    job_id = "missing-job"
    assert get_digest_job(job_id, None) is None
