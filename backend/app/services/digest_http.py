import logging
import sqlite3

import psycopg
from fastapi import HTTPException
from openai import AuthenticationError, RateLimitError

from digest.llm_override import effective_llm_api_key
from digest.config import settings
from digest.models import DigestRequest, DigestResponse, MonthlyDigestRequest, MonthlyDigestResponse
from digest.snapshot_store import (
    digest_profile_exists_for_user,
    init_snapshot_schema,
    snapshot_connection,
)
from pipeline.run import run_digest
from pipeline.run_monthly import run_monthly_digest

logger = logging.getLogger(__name__)


async def execute_digest(body: DigestRequest, document_user_id: str | None = None) -> DigestResponse:
    if not effective_llm_api_key():
        raise HTTPException(
            status_code=503,
            detail="Укажите ключ LLM в .env на сервере или передайте свой ключ заголовком X-Kamgu-Llm-Key (см. документацию API).",
        )
    try:
        return await run_digest(body, document_user_id=document_user_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RateLimitError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Лимит LLM (OpenRouter/провайдер). Для :free моделей смените OPENAI_MODEL "
                "на платную/другую или повторите позже. Подробности: "
                + str(e)
            ),
        ) from e
    except AuthenticationError as e:
        raise HTTPException(
            status_code=401,
            detail=(
                "Ключ LLM не подходит для выбранного сервера. "
                "Если OPENAI_BASE_URL указывает на OpenRouter, нужен ключ с "
                "https://openrouter.ai/keys (обычно sk-or-v1-...), а не ключ api.openai.com (sk-proj-...). "
                "Либо оставьте нативный OpenAI: OPENAI_BASE_URL=https://api.openai.com/v1 и ключ OpenAI. "
                f"Ответ API: {e}"
            ),
        ) from e
    except Exception:
        logger.exception("Digest pipeline failed")
        raise HTTPException(
            status_code=502,
            detail="Внутренняя ошибка при формировании дайджеста. Подробности в логах сервера.",
        ) from None


async def execute_monthly_digest(body: MonthlyDigestRequest, user_id: str) -> MonthlyDigestResponse:
    if not effective_llm_api_key():
        raise HTTPException(
            status_code=503,
            detail="Укажите ключ LLM в .env на сервере или передайте свой ключ заголовком X-Kamgu-Llm-Key.",
        )
    pid = body.profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой.")
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if not digest_profile_exists_for_user(conn, user_id, pid):
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Профиль не найден. Создайте направление через POST /trends/profiles "
                        "или выберите существующий профиль в интерфейсе."
                    ),
                )
    except HTTPException:
        raise
    except (OSError, ValueError, sqlite3.Error, psycopg.Error) as e:
        raise HTTPException(
            status_code=503,
            detail="База снимков недоступна. Проверьте SNAPSHOT_DATABASE_URL на сервере.",
        ) from e
    try:
        return await run_monthly_digest(body, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RateLimitError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Лимит LLM (OpenRouter/провайдер). Смените OPENAI_MODEL или повторите позже. "
                + str(e)
            ),
        ) from e
    except AuthenticationError as e:
        raise HTTPException(
            status_code=401,
            detail=(
                "Ключ LLM не подходит для выбранного сервера. "
                f"Ответ API: {e}"
            ),
        ) from e
    except Exception:
        logger.exception("Monthly digest pipeline failed")
        raise HTTPException(
            status_code=502,
            detail="Внутренняя ошибка при ежемесячном дайджесте. Подробности в логах сервера.",
        ) from None
