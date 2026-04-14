#!/usr/bin/env bash
# Запуск на сервере из каталога с клоном репозитория (например /opt/kamgu).
# git pull → (опционально) сборка фронта → docker compose для API.
#
# Важно: при `bash deploy/remote-update.sh` bash читает файл в память один раз.
# `git pull` обновляет скрипт на диске, но дальше выполняется СТАРАЯ версия — поэтому
# после pull делаем exec, чтобы заново запустить актуальный скрипт с диска.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SELF="$ROOT/deploy/remote-update.sh"
cd "$ROOT"

if [ -z "${REMOTE_UPDATE_REEXEC:-}" ]; then
  git pull --ff-only
  export REMOTE_UPDATE_REEXEC=1
  exec bash "$SELF"
fi

# Одна строка KEY=value из .env без `source` (иначе bash ломается на пробелах/кавычках в произвольных полях).
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

# Переменные для Vite подхватываем только так — полный `source .env` недопустим (напр. описания с пробелами).
if [ -f .env ]; then
  _dbf=$(_read_dotenv_key DEPLOY_BUILD_FRONT .env 2>/dev/null || true)
  [ -n "$_dbf" ] && export DEPLOY_BUILD_FRONT="$_dbf"
  export VITE_API_BASE_URL="$(_read_dotenv_key VITE_API_BASE_URL .env 2>/dev/null || true)"
  export VITE_MONTHLY_INTERNAL_KEY="$(_read_dotenv_key VITE_MONTHLY_INTERNAL_KEY .env 2>/dev/null || true)"
  export FRONT_STATIC_ROOT="$(_read_dotenv_key FRONT_STATIC_ROOT .env 2>/dev/null || true)"
else
  echo "remote-update: предупреждение: нет файла $ROOT/.env — задайте VITE_API_BASE_URL и др." >&2
fi

# Сборка Vite: нужны Node/npm на сервере и VITE_API_BASE_URL в корневом .env (см. deploy/README.md).
# Отключить: DEPLOY_BUILD_FRONT=0 в .env или в окружении.
echo "remote-update: шаг фронта (Vite)…"
if [ "${DEPLOY_BUILD_FRONT:-1}" != "0" ] && command -v npm >/dev/null 2>&1; then
  if [ -z "${VITE_API_BASE_URL:-}" ]; then
    echo "remote-update: фронт НЕ собран: в $ROOT/.env нет VITE_API_BASE_URL=... (нужен URL API, напр. https://api.example.com). Интерфейс на сайте не обновится, пока не зададите и не пересоберёте." >&2
  else
    echo "remote-update: сборка фронта (npm ci && npm run build), API в бандле: ${VITE_API_BASE_URL}"
    (cd front && npm ci && npm run build)
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

docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps
