import fitz

from documents.pdf_extract import extract_publication_from_pdf
from documents.store import normalize_document_id


def test_normalize_document_id_accepts_uuid_hex():
    u = "a1b2c3d4e5f6789012345678abcdef01"
    assert normalize_document_id(u) == u
    assert normalize_document_id("A1B2C3D4-E5F6-7890-1234-5678ABCDEF01") == u


def test_normalize_document_id_rejects_garbage():
    assert normalize_document_id("") is None
    assert normalize_document_id("../etc/passwd") is None
    assert normalize_document_id("short") is None


def test_extract_minimal_pdf_finds_doi():
    doc = fitz.open()
    try:
        page = doc.new_page()
        page.insert_text((72, 72), "Sample Article Title\n\nAbstract here. doi: 10.1000/xyz")
        data = doc.tobytes()
    finally:
        doc.close()

    r = extract_publication_from_pdf(
        data,
        max_pages=2,
        max_chars_abstract=5000,
        document_ref="test.pdf",
    )
    assert r.publication.doi == "10.1000/xyz"
    assert "Sample" in r.publication.title or "test.pdf" in r.publication.title
    assert r.publication.source == "user_pdf"
