# Развёртывание KamGU на VPS (Ubuntu)

Краткий чеклист для продакшена: ОС, Docker, секреты, прокси и связка фронта с API.

## 1. Сервер (Ubuntu Server 22.04/24.04 LTS)

- Откройте в фаерволе **22** (SSH), **80** и **443** (HTTP/HTTPS). Порт PostgreSQL наружу не публикуйте, если БД только для приложения на том же хосте.
- Создайте пользователя для деплоя (не root), настройте вход по SSH-ключу.
- Установите [Docker Engine](https://docs.docker.com/engine/install/ubuntu/) и плагин Compose.

## 2. Клонирование и окружение

```bash
sudo mkdir -p /opt/kamgu && sudo chown "$USER":"$USER" /opt/kamgu
cd /opt/kamgu
git clone <URL-репозитория> .
cp backend/.env.example .env
# Добавьте POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB — см. deploy/.env.production.example
nano .env   # ключи LLM, пароль БД, CORS
```

Файл `.env` в корне репозитория не коммитится. Переменные `POSTGRES_*` нужны Compose для сервиса `postgres`. Для контейнера `api` URL снимков задаётся в [docker-compose.prod.yml](../docker-compose.prod.yml) (`SNAPSHOT_DATABASE_URL` на хост `postgres`); при необходимости закомментируйте `SNAPSHOT_DATABASE_URL` в `.env`, чтобы не путаться со старым `127.0.0.1`.

## 3. Запуск API и PostgreSQL

Из корня репозитория (рядом с `docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Проверка: `curl -s http://127.0.0.1:8080/health` на сервере.

## 4. Reverse proxy и TLS

Выберите **Caddy** (проще TLS) или **Nginx**. Примеры:

- [Caddyfile.example](Caddyfile.example)
- [nginx.example.conf](nginx.example.conf)

На том же хосте API слушает `127.0.0.1:8080` (см. `docker-compose.prod.yml`). Фронт — статика после `npm run build` в каталоге `front/dist` (укажите путь в конфиге прокси).

## 5. Фронтенд (Vite)

При сборке задайте URL API:

```bash
cd front
export VITE_API_BASE_URL="https://api.example.com"   # или ваш URL
npm ci && npm run build
```

Скопируйте `front/dist` на сервер и раздавайте через прокси как статику.

На бэкенде в `.env` укажите `CORS_ORIGINS` со схемой и хостом страницы (например `https://app.example.com`), либо осознанно `*` только для внутренних тестов.

## 6. CI/CD

- **CI:** GitHub Actions [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — тесты бэкенда и сборка фронта.
- **CD (опционально):** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — ручной запуск (`workflow_dispatch`) и SSH-обновление на сервере через [remote-update.sh](remote-update.sh).

### Секреты GitHub для деплоя

| Secret | Назначение |
|--------|------------|
| `DEPLOY_HOST` | IP или hostname сервера |
| `DEPLOY_USER` | SSH-пользователь |
| `DEPLOY_SSH_KEY` | Приватный ключ (полный PEM) |
| `DEPLOY_PATH` | Каталог с клоном репозитория на сервере (например `/opt/kamgu`) |

Если секреты не заданы, используйте только ручной деплой: `git pull` на сервере и команда `docker compose` из п. 3.

## 7. Альтернатива: GitLab CI

Файл [`.gitlab-ci.yml`](../.gitlab-ci.yml) дублирует проверки CI для репозитория на GitLab.
