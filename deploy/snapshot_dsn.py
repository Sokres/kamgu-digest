#!/usr/bin/env python3
"""Печатает SNAPSHOT_DATABASE_URL для docker-compose.prod.yml с URL-кодированием пароля.

Символы @ : / ? # и др. в пароле ломают строку postgresql://user:pass@host без кодирования.
Запуск из корня репозитория: python3 deploy/snapshot_dsn.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import quote


def _parse_env_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if "=" not in line:
        return None
    key, _, rest = line.partition("=")
    key = key.strip()
    val = rest.strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1]
    return key, val


def read_postgres_from_env(env_path: Path) -> tuple[str, str, str]:
    user, password, db = "postgres", "postgres", "kamgu_digest"
    if not env_path.is_file():
        print(f"Файл не найден: {env_path}", file=sys.stderr)
        sys.exit(1)
    for line in env_path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(line)
        if not parsed:
            continue
        k, v = parsed
        if k == "POSTGRES_USER":
            user = v
        elif k == "POSTGRES_PASSWORD":
            password = v
        elif k == "POSTGRES_DB":
            db = v
    return user, password, db


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    user, password, db = read_postgres_from_env(env_path)
    # quote: безопасные символы в userinfo; пароль может содержать @, :, и т.д.
    u = quote(user, safe="")
    p = quote(password, safe="")
    d = quote(db, safe="")
    print(f"postgresql://{u}:{p}@postgres:5432/{d}")


if __name__ == "__main__":
    main()
