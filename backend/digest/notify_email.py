"""Уведомления по SMTP после запуска расписания (опционально)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from digest.config import settings

logger = logging.getLogger(__name__)


def _recipients() -> list[str]:
    raw = (settings.digest_notify_to_email or "").strip()
    if not raw:
        return []
    return [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]


def send_schedule_digest_notification(*, subject: str, body: str) -> None:
    """Синхронная отправка. Без настроек SMTP или адресов — no-op."""
    host = (settings.smtp_host or "").strip()
    to_list = _recipients()
    if not host or not to_list:
        return
    from_addr = (settings.digest_notify_from_email or settings.smtp_user or "").strip()
    if not from_addr:
        logger.warning("digest email: задайте SMTP_USER или DIGEST_NOTIFY_FROM_EMAIL")
        return
    port = max(1, min(int(settings.smtp_port), 65535))
    msg = EmailMessage()
    msg["Subject"] = subject[:900]
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_list)
    msg.set_content(body[:50_000])
    try:
        with smtplib.SMTP(host, port, timeout=45) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            user = (settings.smtp_user or "").strip()
            pwd = (settings.smtp_password or "").strip()
            if user and pwd:
                smtp.login(user, pwd)
            smtp.send_message(msg)
        logger.info("digest email: sent to %s", to_list)
    except Exception:
        logger.exception("digest email: send failed")
