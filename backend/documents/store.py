"""Хранение загруженных PDF и кэш извлечённого PublicationInput на диске."""

from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path

from pydantic import BaseModel, Field

from digest.config import settings
from digest.models import PublicationInput
from documents.pdf_extract import extract_publication_from_pdf

logger = logging.getLogger(__name__)

_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def normalize_document_id(raw: str) -> str | None:
    s = raw.strip().lower().replace("-", "")
    if _ID_RE.match(s):
        return s
    return None


class StoredDocumentRecord(BaseModel):
    """Сериализация рядом с .pdf для повторного использования в /digests."""

    id: str
    original_filename: str = ""
    publication: PublicationInput
    warnings: list[str] = Field(default_factory=list)


class DocumentStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root or settings.documents_storage_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _paths(self, doc_id: str) -> tuple[Path, Path]:
        return self.root / f"{doc_id}.pdf", self.root / f"{doc_id}.json"

    def save_upload(
        self,
        data: bytes,
        original_filename: str,
    ) -> StoredDocumentRecord:
        max_b = settings.pdf_max_upload_bytes
        if len(data) > max_b:
            raise ValueError(
                f"Файл слишком большой ({len(data)} байт). Лимит: {max_b} байт."
            )

        doc_id = uuid.uuid4().hex
        pdf_path, json_path = self._paths(doc_id)
        pdf_path.write_bytes(data)

        try:
            result = extract_publication_from_pdf(
                data,
                max_pages=settings.pdf_max_pages_extract,
                max_chars_abstract=settings.pdf_max_abstract_chars,
                document_ref=original_filename or doc_id,
            )
        except Exception as e:
            try:
                pdf_path.unlink(missing_ok=True)
            except OSError:
                pass
            logger.warning("PDF extract failed: %s", e)
            raise ValueError(f"Не удалось прочитать PDF: {e}") from e

        rec = StoredDocumentRecord(
            id=doc_id,
            original_filename=original_filename or "",
            publication=result.publication,
            warnings=result.warnings,
        )
        json_path.write_text(
            rec.model_dump_json(ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return rec

    def load_record(self, doc_id: str) -> StoredDocumentRecord | None:
        nd = normalize_document_id(doc_id)
        if not nd:
            return None
        _, json_path = self._paths(nd)
        if not json_path.is_file():
            return None
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            return StoredDocumentRecord.model_validate(data)
        except (OSError, json.JSONDecodeError, ValueError) as e:
            logger.warning("load_record %s: %s", nd, e)
            return None


def get_store(document_user_id: str | None = None) -> DocumentStore:
    base = Path(settings.documents_storage_dir).resolve()
    if document_user_id and str(document_user_id).strip():
        return DocumentStore(base / str(document_user_id).strip())
    return DocumentStore(base)


def load_publications_for_digest(
    store: DocumentStore,
    raw_ids: list[str],
) -> tuple[list[PublicationInput], list[str], list[str]]:
    """
    Загружает сохранённые PublicationInput по id. Возвращает публикации, предупреждения
    и список id, которые не найдены на диске.
    """
    pubs: list[PublicationInput] = []
    warnings: list[str] = []
    missing: list[str] = []
    seen: set[str] = set()
    for raw in raw_ids:
        nd = normalize_document_id(raw)
        if not nd:
            warnings.append(f"invalid_document_id:{raw[:24]}")
            continue
        if nd in seen:
            continue
        seen.add(nd)
        rec = store.load_record(nd)
        if rec is None:
            missing.append(raw)
            continue
        pubs.append(rec.publication)
        for w in rec.warnings:
            if w not in warnings:
                warnings.append(w)
    return pubs, warnings, missing
