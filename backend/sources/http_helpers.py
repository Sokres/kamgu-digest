import asyncio
import logging
import random
import ssl
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _backoff_seconds(attempt: int, cap: float = 25.0) -> float:
    return min(cap, (2**attempt) * 0.6 + random.random() * 0.5)


async def _sleep_after_rate_limit(
    response: httpx.Response,
    attempt: int,
    *,
    url: str = "",
) -> None:
    """Для 429: дольше ждём + опционально Retry-After (секунды)."""
    extra = 0.0
    ra = response.headers.get("Retry-After")
    if ra:
        try:
            extra = max(extra, float(ra))
        except ValueError:
            pass
    base = _backoff_seconds(attempt)
    if response.status_code == 429:
        base = max(base, 3.5 + float(attempt) * 4.0 + random.random())
        if "semanticscholar.org" in url:
            # Бесплатный API SS: нужны длинные паузы (порядка десятков секунд между попытками).
            base = max(base, 12.0 + float(attempt) * 14.0 + random.random() * 3.0)
    await asyncio.sleep(max(base, extra))


async def get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    max_attempts: int = 5,
) -> dict[str, Any] | None:
    """
    GET с ретраями при 429/502/503/504 и транспортных ошибках (в т.ч. SSL при чтении тела).
    Возвращает dict или None, если все попытки исчерпаны.
    """
    params = params or {}
    headers = headers or {}
    last_msg = ""
    for attempt in range(max_attempts):
        try:
            r = await client.get(url, params=params, headers=headers)
            if r.status_code == 429:
                last_msg = f"HTTP {r.status_code}"
                logger.warning("%s — %s, retry %s/%s", url[:72], last_msg, attempt + 1, max_attempts)
                await _sleep_after_rate_limit(r, attempt, url=url)
                continue
            if r.status_code in (502, 503, 504):
                last_msg = f"HTTP {r.status_code}"
                logger.warning("%s — %s, retry %s/%s", url[:72], last_msg, attempt + 1, max_attempts)
                await asyncio.sleep(_backoff_seconds(attempt))
                continue
            r.raise_for_status()
            try:
                data = r.json()
            except ValueError:
                logger.warning("Invalid JSON from %s, retry", url[:72])
                await asyncio.sleep(_backoff_seconds(attempt))
                continue
            if not isinstance(data, dict):
                return None
            return data
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            if code == 429:
                last_msg = str(e)
                await _sleep_after_rate_limit(e.response, attempt, url=url)
                continue
            if code in (502, 503, 504):
                last_msg = str(e)
                await asyncio.sleep(_backoff_seconds(attempt))
                continue
            logger.warning("HTTP %s for %s: %s", code, url[:72], e)
            return None
        except (httpx.RequestError, ssl.SSLError, OSError, RuntimeError) as e:
            last_msg = str(e)
            logger.warning(
                "Transport error %s (attempt %s/%s): %s",
                url[:72],
                attempt + 1,
                max_attempts,
                e,
            )
            await asyncio.sleep(_backoff_seconds(attempt))
    logger.error("get_json exhausted retries (%s): %s", max_attempts, last_msg)
    return None
