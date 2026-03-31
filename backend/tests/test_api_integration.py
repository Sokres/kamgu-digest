"""Интеграционные тесты HTTP-слоя (моки пайплайна)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from digest.config import settings
from digest.models import (
    DigestMeta,
    DigestResponse,
    MonthlyDigestMeta,
    MonthlyDigestResponse,
    MonthlyStructuredDelta,
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "snapshot_database_url", "sqlite:///:memory:", raising=False)
    monkeypatch.setattr(settings, "digest_rate_limit_per_minute", 0, raising=False)
    monkeypatch.setattr(settings, "monthly_digest_cron_secret", "", raising=False)
    from app.main import app

    return TestClient(app)


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_ready(client: TestClient) -> None:
    r = client.get("/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ready"
    assert body.get("database") == "ok"


def test_x_request_id_header(client: TestClient) -> None:
    r = client.get("/health", headers={"X-Request-ID": "trace-test-1"})
    assert r.status_code == 200
    assert r.headers.get("X-Request-ID") == "trace-test-1"


def test_post_digests_mocked(client: TestClient) -> None:
    mock_resp = DigestResponse(
        publications_used=[],
        article_cards=[],
        digest_ru="ru",
        digest_en="en",
        meta=DigestMeta(),
    )
    with patch(
        "app.api.routes.digests.execute_digest",
        new=AsyncMock(return_value=mock_resp),
    ):
        r = client.post("/digests", json={"topic_queries": ["quantum"]})
    assert r.status_code == 200
    data = r.json()
    assert data["digest_ru"] == "ru"
    assert data["digest_en"] == "en"


def test_post_digests_periodic_alias_mocked(client: TestClient) -> None:
    delta = MonthlyStructuredDelta(
        profile_id="p",
        current_period="2025-01",
        compared_period=None,
        is_baseline=True,
    )
    mock_resp = MonthlyDigestResponse(
        publications_used=[],
        article_cards=[],
        digest_ru="ru",
        digest_en="en",
        structured_delta=delta,
        meta=MonthlyDigestMeta(),
    )
    with patch(
        "app.api.routes.digests.execute_monthly_digest",
        new=AsyncMock(return_value=mock_resp),
    ):
        r_periodic = client.post(
            "/digests/periodic",
            json={
                "profile_id": "p",
                "topic_queries": ["x"],
            },
        )
        r_monthly = client.post(
            "/digests/monthly",
            json={
                "profile_id": "p",
                "topic_queries": ["x"],
            },
        )
    assert r_periodic.status_code == 200
    assert r_monthly.status_code == 200
    assert r_periodic.json()["structured_delta"]["profile_id"] == "p"


def test_rate_limit_429(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api import deps

    deps._digest_rate_buckets.clear()
    monkeypatch.setattr(settings, "snapshot_database_url", "sqlite:///:memory:", raising=False)
    monkeypatch.setattr(settings, "digest_rate_limit_per_minute", 2, raising=False)
    monkeypatch.setattr(settings, "monthly_digest_cron_secret", "", raising=False)
    from app.main import app

    tc = TestClient(app)
    mock_resp = DigestResponse(
        publications_used=[],
        article_cards=[],
        digest_ru="r",
        digest_en="e",
        meta=DigestMeta(),
    )
    with patch(
        "app.api.routes.digests.execute_digest",
        new=AsyncMock(return_value=mock_resp),
    ):
        assert tc.post("/digests", json={"topic_queries": ["a"]}).status_code == 200
        assert tc.post("/digests", json={"topic_queries": ["b"]}).status_code == 200
        r3 = tc.post("/digests", json={"topic_queries": ["c"]})
    assert r3.status_code == 429
