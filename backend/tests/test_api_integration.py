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
def client(monkeypatch: pytest.MonkeyPatch, tmp_path) -> TestClient:
    # Файл на диске: :memory: даёт отдельную БД на каждое соединение, HTTP-тесты теряют данные между запросами.
    db = tmp_path / "api_test.db"
    monkeypatch.setattr(settings, "snapshot_database_url", f"sqlite:///{db}", raising=False)
    monkeypatch.setattr(settings, "digest_rate_limit_per_minute", 0, raising=False)
    monkeypatch.setattr(settings, "monthly_digest_cron_secret", "", raising=False)
    monkeypatch.setattr(settings, "auth_enabled", False, raising=False)
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


def test_get_digest_schedules_empty(client: TestClient) -> None:
    r = client.get("/digests/schedules")
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["scheduler_enabled_in_config"] is False
    assert data["scheduler_running"] is False


def test_post_digest_schedule_roundtrip(client: TestClient) -> None:
    body = {
        "profile_id": "p1",
        "cron_utc": "0 6 1 * *",
        "enabled": True,
        "topic_queries": ["solar"],
        "max_candidates": 50,
        "top_n_for_llm": 10,
        "trend_top_k": 10,
    }
    r = client.post("/digests/schedules", json=body)
    assert r.status_code == 200
    sid = r.json()["id"]
    assert r.json()["cron_utc"] == "0 6 1 * *"
    r2 = client.get("/digests/schedules")
    assert r2.status_code == 200
    assert len(r2.json()["items"]) == 1
    r3 = client.delete(f"/digests/schedules/{sid}")
    assert r3.status_code == 200
    r4 = client.get("/digests/schedules")
    assert r4.json()["items"] == []


def test_rate_limit_429(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from app.api import deps

    deps._digest_rate_buckets.clear()
    db = tmp_path / "rl.db"
    monkeypatch.setattr(settings, "snapshot_database_url", f"sqlite:///{db}", raising=False)
    monkeypatch.setattr(settings, "digest_rate_limit_per_minute", 2, raising=False)
    monkeypatch.setattr(settings, "monthly_digest_cron_secret", "", raising=False)
    monkeypatch.setattr(settings, "auth_enabled", False, raising=False)
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
