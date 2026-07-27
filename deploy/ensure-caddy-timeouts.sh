#!/usr/bin/env bash
set -euo pipefail

CADDYFILE="${1:-/etc/caddy/Caddyfile}"

if [ ! -f "$CADDYFILE" ]; then
  echo "ensure-caddy-timeouts: файл не найден: $CADDYFILE" >&2
  exit 1
fi

missing=0
if ! grep -q 'read_timeout' "$CADDYFILE"; then
  echo "ensure-caddy-timeouts: в $CADDYFILE нет read_timeout — POST /digests может обрываться через ~60 с." >&2
  missing=1
fi
if ! grep -q 'write_timeout' "$CADDYFILE"; then
  echo "ensure-caddy-timeouts: в $CADDYFILE нет write_timeout." >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  echo "ensure-caddy-timeouts: образец конфигурации — deploy/Caddyfile.example (read_timeout 20m)." >&2
  echo "ensure-caddy-timeouts: для дайджеста через UI достаточно обновить API+фронт (POST /digests/jobs + polling)." >&2
  exit 2
fi

echo "ensure-caddy-timeouts: OK — таймауты найдены в $CADDYFILE"
if command -v caddy >/dev/null 2>&1; then
  caddy validate --config "$CADDYFILE"
fi
