#!/usr/bin/env bash
# Запуск на сервере из каталога с клоном репозитория (например /opt/kamgu).
# git pull → (опционально) сборка фронта → docker compose для API.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git pull --ff-only

# Сборка Vite: нужны Node/npm на сервере и VITE_API_BASE_URL в корневом .env (см. deploy/README.md).
# Отключить: DEPLOY_BUILD_FRONT=0 в .env или в окружении.
if [ "${DEPLOY_BUILD_FRONT:-1}" != "0" ] && command -v npm >/dev/null 2>&1; then
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
  if [ -z "${VITE_API_BASE_URL:-}" ]; then
    echo "remote-update: задайте VITE_API_BASE_URL в корневом .env (URL API для бандла) или отключите сборку фронта: DEPLOY_BUILD_FRONT=0" >&2
  else
    (cd front && npm ci && npm run build)
    if [ -n "${FRONT_STATIC_ROOT:-}" ]; then
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
  echo "remote-update: npm не найден — фронт не собран. Установите Node.js 20+ или задайте DEPLOY_BUILD_FRONT=0." >&2
fi

docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps
