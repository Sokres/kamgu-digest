from fastapi import Header, HTTPException

from digest.config import settings


def verify_monthly_cron_secret(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> None:
    expected = (settings.monthly_digest_cron_secret or "").strip()
    if not expected:
        return
    got = (x_internal_key or "").strip()
    if got != expected:
        raise HTTPException(status_code=401, detail="Неверный или отсутствует X-Internal-Key.")
