import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from digest.models import PdfDocumentUploadResponse
from documents.store import get_store
from app.api.deps import TokenUser, require_user_when_auth_enabled, verify_digest_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


@router.post(
    "/documents/pdf",
    response_model=PdfDocumentUploadResponse,
    summary="Загрузить PDF для дайджеста",
    description=(
        "Сохраняет файл, извлекает текст и метаданные. Верните поле id в теле POST /digests "
        "как attached_document_ids. При AUTH_ENABLED файлы изолированы по пользователю."
    ),
)
async def upload_pdf(
    file: UploadFile = File(..., description="PDF-файл"),
    _: None = Depends(verify_digest_rate_limit),
    auth_user: TokenUser | None = Depends(require_user_when_auth_enabled),
) -> PdfDocumentUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Укажите файл.")
    ct = (file.content_type or "").lower()
    if ct and "pdf" not in ct and ct != "application/octet-stream":
        raise HTTPException(
            status_code=400,
            detail="Ожидается PDF (application/pdf).",
        )
    try:
        data = await file.read()
    except Exception as e:
        logger.warning("upload read failed: %s", e)
        raise HTTPException(status_code=400, detail="Не удалось прочитать файл.") from e

    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Файл не похож на PDF (нет сигнатуры %PDF).")

    doc_user = auth_user.id if auth_user else None
    store = get_store(doc_user)
    try:
        rec = store.save_upload(data, file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("PDF save/extract failed")
        raise HTTPException(status_code=500, detail="Ошибка обработки PDF.") from e

    return PdfDocumentUploadResponse(
        id=rec.id,
        publication=rec.publication,
        warnings=rec.warnings,
    )
