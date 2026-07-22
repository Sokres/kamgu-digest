#!/usr/bin/env bash
# После git pull — exec актуальной версии с диска (bash иначе держит старый скрипт в памяти).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SELF="$ROOT/deploy/remote-update.sh"
cd "$ROOT"

if [ -z "${REMOTE_UPDATE_REEXEC:-}" ]; then
  git pull --ff-only
  export REMOTE_UPDATE_REEXEC=1
  exec bash "$SELF"
fi

# Без source: пробелы/кавычки в .env ломают bash.
_read_dotenv_key() {
  local key="$1" file="$2" line val
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n1) || return 1
  val="${line#"${key}="}"
  if [[ "$val" =~ ^\".*\"$ ]]; then
    val="${val:1:-1}"
  elif [[ "$val" =~ ^\'.*\'$ ]]; then
    val="${val:1:-1}"
  fi
  printf '%s' "$val"
}

if [ -f .env ]; then
  _dbf=$(_read_dotenv_key DEPLOY_BUILD_FRONT .env 2>/dev/null || true)
  [ -n "$_dbf" ] && export DEPLOY_BUILD_FRONT="$_dbf"
  export VITE_API_BASE_URL="$(_read_dotenv_key VITE_API_BASE_URL .env 2>/dev/null || true)"
  export VITE_MONTHLY_INTERNAL_KEY="$(_read_dotenv_key VITE_MONTHLY_INTERNAL_KEY .env 2>/dev/null || true)"
  export FRONT_STATIC_ROOT="$(_read_dotenv_key FRONT_STATIC_ROOT .env 2>/dev/null || true)"
  export DOCKERHUB_USERNAME="$(_read_dotenv_key DOCKERHUB_USERNAME .env 2>/dev/null || true)"
  export DOCKERHUB_TOKEN="$(_read_dotenv_key DOCKERHUB_TOKEN .env 2>/dev/null || true)"
else
  echo "remote-update: предупреждение: нет файла $ROOT/.env — задайте VITE_API_BASE_URL и др." >&2
fi

echo "remote-update: шаг фронта (Vite)…"
if [ "${DEPLOY_BUILD_FRONT:-1}" != "0" ] && command -v npm >/dev/null 2>&1; then
  if [ -z "${VITE_API_BASE_URL:-}" ]; then
    echo "remote-update: фронт НЕ собран: в $ROOT/.env нет VITE_API_BASE_URL=... (нужен URL API, напр. https://api.example.com). Интерфейс на сайте не обновится, пока не зададите и не пересоберёте." >&2
  else
    echo "remote-update: сборка фронта (npm ci && npm run build), API в бандле: ${VITE_API_BASE_URL}"
    # NODE_ENV=production ломает npm ci (нет typescript/vite в prod deps).
    (
      cd front
      export NODE_ENV=development
      npm ci
      export NODE_ENV=production
      npm run build
    )
    echo "remote-update: фронт собран: $ROOT/front/dist (проверьте root в Caddy/Nginx на этот каталог или на FRONT_STATIC_ROOT)"
    if [ -n "${FRONT_STATIC_ROOT:-}" ]; then
      echo "remote-update: копирование dist → $FRONT_STATIC_ROOT"
      install -d "$FRONT_STATIC_ROOT"
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete front/dist/ "$FRONT_STATIC_ROOT"/
      else
        find "$FRONT_STATIC_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
        cp -a front/dist/. "$FRONT_STATIC_ROOT"/
      fi
    fi
  fi
elif [ "${DEPLOY_BUILD_FRONT:-1}" != "0" ]; then
  echo "remote-update: npm не найден — фронт НЕ собран. Установите Node.js 20+ (см. deploy/README.md) или задайте DEPLOY_BUILD_FRONT=0." >&2
fi

if [ -n "${DOCKERHUB_USERNAME:-}" ] && [ -n "${DOCKERHUB_TOKEN:-}" ]; then
  echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin docker.io >/dev/null
fi

_compose_up_with_retry() {
  local attempt=1 max=4 wait=45
  while [ "$attempt" -le "$max" ]; do
    if docker compose -f docker-compose.prod.yml --env-file .env up -d --build; then
      return 0
    fi
    if [ "$attempt" -lt "$max" ]; then
      echo "remote-update: docker compose не удался (попытка ${attempt}/${max}), повтор через ${wait}s…" >&2
      sleep "$wait"
      wait=$((wait * 2))
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

_compose_up_with_retry
docker compose -f docker-compose.prod.yml ps
