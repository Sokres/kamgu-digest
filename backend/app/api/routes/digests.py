from fastapi import APIRouter, Depends, Header, HTTPException

from digest.digest_jobs import capture_llm_override, get_digest_job, job_elapsed_seconds, start_digest_job
from digest.llm_override import effective_llm_api_key
from digest.models import (
    DigestJobCreated,
    DigestJobStatusOut,
    DigestRequest,
    DigestResponse,
    MonthlyDigestRequest,
    MonthlyDigestResponse,
)
from app.api.deps import (
    TokenUser,
    llm_client_override_dependency,
    require_user_when_auth_enabled,
    resolve_periodic_user_id,
    verify_digest_rate_limit,
)
from app.services.digest_http import execute_digest, execute_monthly_digest

router = APIRouter(tags=["digests"])


@router.post("/digests/jobs", response_model=DigestJobCreated, status_code=202)
async def create_digest_job(
    body: DigestRequest,
    _: None = Depends(verify_digest_rate_limit),
    __: None = Depends(llm_client_override_dependency),
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> DigestJobCreated:
    if not effective_llm_api_key():
        raise HTTPException(
            status_code=503,
            detail="Укажите ключ LLM в .env на сервере или передайте свой ключ заголовком X-Kamgu-Llm-Key.",
        )
    doc_uid = auth_user.id if auth_user else None
    llm_override = capture_llm_override()
    job = await start_digest_job(body, document_user_id=doc_uid, llm_override=llm_override)
    return DigestJobCreated(job_id=job.id, status=job.status)


@router.get("/digests/jobs/{job_id}", response_model=DigestJobStatusOut)
async def get_digest_job_status(
    job_id: str,
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> DigestJobStatusOut:
    doc_uid = auth_user.id if auth_user else None
    job = get_digest_job(job_id.strip(), doc_uid)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена или недоступна.")
    return DigestJobStatusOut(
        job_id=job.id,
        status=job.status,
        error=job.error,
        error_status=job.error_status,
        result=job.result,
        elapsed_seconds=job_elapsed_seconds(job),
    )


@router.post("/digests", response_model=DigestResponse)
async def create_digest(
    body: DigestRequest,
    _: None = Depends(verify_digest_rate_limit),
    __: None = Depends(llm_client_override_dependency),
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
    _: None = Depends(llm_client_override_dependency),
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> MonthlyDigestResponse:
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    return await execute_monthly_digest(body, user_id=uid)
