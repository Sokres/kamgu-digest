import asyncio
import time
from collections import defaultdict

from fastapi import Header, HTTPException, Request

from digest.config import settings

_digest_rate_buckets: dict[str, list[float]] = defaultdict(list)
_digest_rate_lock = asyncio.Lock()


async def verify_digest_rate_limit(request: Request) -> None:
    limit = int(settings.digest_rate_limit_per_minute or 0)
    if limit <= 0:
        return
    client = request.client
    key = (client.host if client else None) or "unknown"
    window = 60.0
    now = time.time()
    async with _digest_rate_lock:
        bucket = _digest_rate_buckets[key]
        bucket[:] = [t for t in bucket if now - t < window]
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов к /digests. Повторите позже.",
            )
        bucket.append(now)


def verify_monthly_cron_secret(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> None:
    expected = (settings.monthly_digest_cron_secret or "").strip()
    if not expected:
        return
    got = (x_internal_key or "").strip()
    if got != expected:
        raise HTTPException(status_code=401, detail="Неверный или отсутствует X-Internal-Key.")


# Тот же секрет: /digests/periodic, /digests/monthly, PUT /trends/.../label
verify_internal_cron_secret = verify_monthly_cron_secret
