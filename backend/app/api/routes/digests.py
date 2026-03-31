from fastapi import APIRouter, Depends

from digest.models import DigestRequest, DigestResponse, MonthlyDigestRequest, MonthlyDigestResponse
from app.api.deps import verify_digest_rate_limit, verify_monthly_cron_secret
from app.services.digest_http import execute_digest, execute_monthly_digest

router = APIRouter(tags=["digests"])


@router.post("/digests", response_model=DigestResponse)
async def create_digest(
    body: DigestRequest,
    _: None = Depends(verify_digest_rate_limit),
) -> DigestResponse:
    return await execute_digest(body)


@router.post(
    "/digests/monthly",
    response_model=MonthlyDigestResponse,
    summary="Периодический дайджест (устаревшее имя пути)",
    description=(
        "То же, что POST /digests/periodic. Имя «monthly» сохранено для совместимости; "
        "частота запусков (месяц, квартал и т.д.) задаётся внешним планировщиком."
    ),
)
@router.post(
    "/digests/periodic",
    response_model=MonthlyDigestResponse,
    summary="Периодический дайджест со снимками",
    description=(
        "Снимок топ-публикаций по профилю, сравнение с предыдущим периодом, LLM-текст. "
        "Частота (ежемесячно, раз в квартал и т.п.) определяется только расписанием вызывающей системы."
    ),
)
async def create_periodic_digest(
    body: MonthlyDigestRequest,
    _: None = Depends(verify_monthly_cron_secret),
) -> MonthlyDigestResponse:
    return await execute_monthly_digest(body)
