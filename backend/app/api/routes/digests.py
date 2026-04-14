from fastapi import APIRouter, Depends, Header

from digest.models import DigestRequest, DigestResponse, MonthlyDigestRequest, MonthlyDigestResponse
from app.api.deps import (
    TokenUser,
    require_user_when_auth_enabled,
    resolve_periodic_user_id,
    verify_digest_rate_limit,
)
from app.services.digest_http import execute_digest, execute_monthly_digest

router = APIRouter(tags=["digests"])


@router.post("/digests", response_model=DigestResponse)
async def create_digest(
    body: DigestRequest,
    _: None = Depends(verify_digest_rate_limit),
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> DigestResponse:
    doc_uid = auth_user.id if auth_user else None
    return await execute_digest(body, document_user_id=doc_uid)


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
        "Частота (ежемесячно, раз в квартал и т.п.) определяется только расписанием вызывающей системы. "
        "При AUTH_ENABLED: Authorization: Bearer или X-Internal-Key (+ опционально X-Acting-User-Id для мультиарендности)."
    ),
)
async def create_periodic_digest(
    body: MonthlyDigestRequest,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> MonthlyDigestResponse:
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    return await execute_monthly_digest(body, user_id=uid)
