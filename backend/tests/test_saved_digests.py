"""Сохранённые дайджесты: таблица и CRUD."""

from __future__ import annotations

import json

import pytest

from digest.config import settings
from digest.models import DigestMeta, DigestRequest, DigestResponse, PublicationInput
from digest.saved_digest_store import (
    delete_saved_digest,
    get_saved_digest_row,
    insert_saved_digest,
    list_saved_digests_for_user,
    new_saved_digest_id,
)
from digest.snapshot_store import init_snapshot_schema, snapshot_connection


def _minimal_digest_response() -> DigestResponse:
    return DigestResponse(
        publications_used=[
            PublicationInput(title="Test paper", abstract="Abstract"),
        ],
        article_cards=[],
        digest_ru="ru",
        digest_en="en",
        meta=DigestMeta(digest_mode="peer_reviewed", used_for_llm=1),
    )


def test_insert_list_get_delete_roundtrip(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    db = tmp_path / "saved.db"
    url = f"sqlite:///{db}"
    monkeypatch.setattr(settings, "snapshot_database_url", url, raising=False)

    uid = "user-1"
    payload = {
        "version": 1,
        "digest_response": _minimal_digest_response().model_dump(),
        "request": DigestRequest(topic_queries=["q"]).model_dump(),
    }

    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        sid, created_at = insert_saved_digest(conn, uid, "My title", payload)

    assert len(sid) == 32
    assert created_at

    with snapshot_connection(settings.snapshot_database_url) as conn:
        rows = list_saved_digests_for_user(conn, uid)
        assert len(rows) == 1
        assert rows[0][0] == sid
        assert rows[0][1] == "My title"

        got = get_saved_digest_row(conn, uid, sid)
        assert got is not None
        assert json.loads(got[3])["digest_response"]["digest_ru"] == "ru"

        ok = delete_saved_digest(conn, uid, sid)
        assert ok is True

        assert get_saved_digest_row(conn, uid, sid) is None


def test_delete_nonexistent_returns_false(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    db = tmp_path / "saved2.db"
    monkeypatch.setattr(settings, "snapshot_database_url", f"sqlite:///{db}", raising=False)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        ok = delete_saved_digest(conn, "u", "nonexistent")
        assert ok is False


def test_new_saved_digest_id_unique() -> None:
    a = new_saved_digest_id()
    b = new_saved_digest_id()
    assert a != b
    assert len(a) == 32
