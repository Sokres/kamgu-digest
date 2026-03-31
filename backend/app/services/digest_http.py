import logging

from fastapi import HTTPException
from openai import AuthenticationError, RateLimitError

from digest.config import settings
from digest.models import DigestRequest, DigestResponse, MonthlyDigestRequest, MonthlyDigestResponse
from pipeline.run import run_digest
from pipeline.run_monthly import run_monthly_digest

logger = logging.getLogger(__name__)


async def execute_digest(body: DigestRequest) -> DigestResponse:
    if not settings.llm_api_key_resolved():
        raise HTTPException(
            status_code=503,
            detail="Укажите OPENAI_API_KEY или OPENROUTER_API_KEY в .env",
        )
    try:
        return await run_digest(body)
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


async def execute_monthly_digest(body: MonthlyDigestRequest) -> MonthlyDigestResponse:
    if not settings.llm_api_key_resolved():
        raise HTTPException(
            status_code=503,
            detail="Укажите OPENAI_API_KEY или OPENROUTER_API_KEY в .env",
        )
    try:
        return await run_monthly_digest(body)
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
