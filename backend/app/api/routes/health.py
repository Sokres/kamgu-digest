from fastapi import APIRouter, HTTPException

from digest.config import settings
from digest.snapshot_store import init_snapshot_schema, snapshot_connection

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness: процесс отвечает."""
    return {"status": "ok"}


@router.get("/health/ready")
def health_ready() -> dict[str, str]:
    """Readiness: доступна БД снимков (PostgreSQL или SQLite из SNAPSHOT_DATABASE_URL)."""
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"snapshot_database_unavailable: {e}",
        ) from e
    return {"status": "ready", "database": "ok"}
