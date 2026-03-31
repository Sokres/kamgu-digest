from fastapi import APIRouter, Depends

from digest.models import DigestRequest, DigestResponse, MonthlyDigestRequest, MonthlyDigestResponse
from app.api.deps import verify_monthly_cron_secret
from app.services.digest_http import execute_digest, execute_monthly_digest

router = APIRouter(tags=["digests"])


@router.post("/digests", response_model=DigestResponse)
async def create_digest(body: DigestRequest) -> DigestResponse:
    return await execute_digest(body)


@router.post("/digests/monthly", response_model=MonthlyDigestResponse)
async def create_monthly_digest(
    body: MonthlyDigestRequest,
    _: None = Depends(verify_monthly_cron_secret),
) -> MonthlyDigestResponse:
    return await execute_monthly_digest(body)
