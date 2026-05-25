"""Токены и refresh-сессии."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from digest.config import settings


@pytest.fixture
def auth_client(monkeypatch: pytest.MonkeyPatch, tmp_path) -> TestClient:
    db = tmp_path / "auth_api.db"
    monkeypatch.setattr(settings, "snapshot_database_url", f"sqlite:///{db}", raising=False)
    monkeypatch.setattr(settings, "digest_rate_limit_per_minute", 0, raising=False)
    monkeypatch.setattr(settings, "monthly_digest_cron_secret", "", raising=False)
    monkeypatch.setattr(settings, "auth_enabled", True, raising=False)
    monkeypatch.setattr(settings, "auth_jwt_secret", "test-secret-for-jwt-tests-only", raising=False)
    monkeypatch.setattr(settings, "auth_registration_enabled", True, raising=False)
    from app.main import app

    return TestClient(app)


def test_register_login_refresh_and_revoke_on_reuse(auth_client: TestClient) -> None:
    r = auth_client.post("/auth/register", json={"username": "u_refresh", "password": "password12"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and "refresh_token" in body
    refresh = body["refresh_token"]
    access = body["access_token"]

    r_me = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r_me.status_code == 200

    r_rf = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r_rf.status_code == 200
    body2 = r_rf.json()
    assert body2["refresh_token"] != refresh
    assert body2["access_token"] != access

    r_old = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r_old.status_code == 401


def test_change_password_invalidates_refresh(auth_client: TestClient) -> None:
    auth_client.post("/auth/register", json={"username": "u_cp", "password": "oldpass123"})
    r_in = auth_client.post("/auth/login", json={"username": "u_cp", "password": "oldpass123"})
    assert r_in.status_code == 200
    refresh = r_in.json()["refresh_token"]
    access = r_in.json()["access_token"]

    r_cp = auth_client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {access}"},
        json={"current_password": "oldpass123", "new_password": "newpass123"},
    )
    assert r_cp.status_code == 204

    r_rf = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r_rf.status_code == 401


def test_logout_with_bearer_revokes_refresh(auth_client: TestClient) -> None:
    auth_client.post("/auth/register", json={"username": "u_out", "password": "password12"})
    r_in = auth_client.post("/auth/login", json={"username": "u_out", "password": "password12"})
    refresh = r_in.json()["refresh_token"]
    access = r_in.json()["access_token"]

    r_lo = auth_client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {access}"},
        json={"refresh_token": refresh},
    )
    assert r_lo.status_code == 204

    r_rf = auth_client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r_rf.status_code == 401
