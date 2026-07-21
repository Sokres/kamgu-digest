# Установка KamGU Digest на сервер (для заказчика)

Пошаговая инструкция: подготовка VPS, PostgreSQL, API и веб-интерфейс.  
Технические детали и устранение неполадок — в [README.md](README.md).

**Что получится**

| Компонент | Как работает |
|-----------|--------------|
| PostgreSQL | Контейнер Docker, данные на диске сервера |
| API | Контейнер Docker, порт `127.0.0.1:8080` |
| Сайт (фронт) | Статика в `front/dist`, раздаётся через Caddy или Nginx |
| HTTPS | Сертификат через Caddy или Nginx + Let's Encrypt |

Ориентир по путям: каталог приложения `/opt/kamgu`, пользователь `deploy`. Домены и IP подставьте свои.

---

## Что нужно заранее

1. **VPS** с Ubuntu Server **22.04** или **24.04** LTS (рекомендуется от **2 ГБ RAM**).
2. **Домен** (или два поддомена), DNS A-записи на IP сервера, например:
   - `app.example.com` — сайт
   - `api.example.com` — API
3. Доступ по **SSH** (логин и пароль или ключ).
4. **Ключ LLM** (OpenRouter, DeepSeek или OpenAI) — без него дайджесты не строятся.
5. URL **репозитория** с кодом (или архив от поставщика).

Порты снаружи: **22** (SSH), **80**, **443**. Порт PostgreSQL **5432** наружу **не** открывайте.

---

## Шаг 1. Пользователь и Docker

Подключитесь к серверу по SSH (под `root` или с `sudo`).

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

Установите Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION_ID}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
```

Выйдите из SSH и зайдите снова под `deploy`. Проверка:

```bash
docker run --rm hello-world
docker compose version
```

Фаервол (если используете `ufw`):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Шаг 2. Код на сервере

```bash
sudo mkdir -p /opt/kamgu && sudo chown "$USER":"$USER" /opt/kamgu
cd /opt/kamgu
git clone <URL-репозитория> .
```

Если репозиторий приватный — настройте доступ Git к GitHub (токен или deploy key). Подробности: [README.md](README.md), раздел «Доступ Git с сервера».

Для сборки сайта установите Node.js **20+**:

```bash
# пример через NodeSource — см. актуальную инструкцию на github.com/nodesource/distributions
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

---

## Шаг 3. База данных и настройки (`.env`)

PostgreSQL **не ставится отдельно**: он поднимается вместе с API через Docker Compose. Нужно только задать пользователя, пароль, имя БД и строку подключения.

### 3.1. Корневой файл `/opt/kamgu/.env`

```bash
cd /opt/kamgu
cp deploy/.env.production.example .env
nano .env
```

Обязательно укажите:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=СИЛЬНЫЙ_ПАРОЛЬ_БЕЗ_СПЕЦСИМВОЛОВ
POSTGRES_DB=kamgu_digest

CORS_ORIGINS=https://app.example.com
VITE_API_BASE_URL=https://api.example.com
```

Рекомендация: пароль БД только из **букв и цифр** (без `@`, `:`, `/`, `?`) — иначе URL подключения ломается.

Сгенерируйте строку подключения и добавьте её в `.env`:

```bash
cd /opt/kamgu
python3 deploy/snapshot_dsn.py
```

В `.env` должна появиться (или уже быть) строка вида:

```env
SNAPSHOT_DATABASE_URL=postgresql://postgres:ВАШ_ПАРОЛЬ@postgres:5432/kamgu_digest
```

Хост в URL — **`postgres`** (имя сервиса в Docker), не `127.0.0.1` и не IP сервера.

### 3.2. Ключи LLM — `/opt/kamgu/backend/.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Пример для OpenRouter:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
```

Либо DeepSeek / OpenAI — см. комментарии в `backend/.env.example`.

---

## Шаг 4. Первый запуск (БД + API)

```bash
cd /opt/kamgu
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Проверка:

```bash
docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1:8080/health
```

Ожидается ответ вроде `{"status":"ok"}`.

Контейнер `postgres` создаёт том `kamgu_pgdata` — данные БД сохраняются при перезапуске контейнеров. Повторно «устанавливать» PostgreSQL не нужно.

Полезные команды:

```bash
# логи API
docker compose -f docker-compose.prod.yml logs -f --tail=100 api

# логи БД
docker compose -f docker-compose.prod.yml logs -f --tail=50 postgres

# статус
docker compose -f docker-compose.prod.yml ps
```

---

## Шаг 5. HTTPS и домены (Caddy или Nginx)

API слушает только localhost (`127.0.0.1:8080`). Снаружи его открывает reverse proxy.

### Вариант A — Caddy (проще TLS)

Установите Caddy, затем настройте `/etc/caddy/Caddyfile` по образцу [Caddyfile.example](Caddyfile.example):

- `api.example.com` → `reverse_proxy 127.0.0.1:8080` (с увеличенными таймаутами — дайджест может идти несколько минут)
- `app.example.com` → `root * /opt/kamgu/front/dist`, `file_server`, `try_files`

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Вариант B — Nginx

Образец: [nginx.example.conf](nginx.example.conf). После правок: `sudo nginx -t && sudo systemctl reload nginx`.

DNS A-записи доменов должны указывать на IP этого сервера **до** выпуска сертификата.

---

## Шаг 6. Сборка сайта (фронтенд)

В корневом `.env` уже должен быть `VITE_API_BASE_URL=https://api.example.com` (без слэша в конце).

```bash
cd /opt/kamgu
bash deploy/remote-update.sh
```

Скрипт: обновит код (`git pull`), соберёт фронт в `front/dist`, пересоберёт и перезапустит контейнеры.

Проверьте, что Caddy/Nginx отдают именно `/opt/kamgu/front/dist` (или каталог из `FRONT_STATIC_ROOT` в `.env`).

В браузере откройте `https://app.example.com` и `https://api.example.com/health`.

---

## Шаг 7. Обновление после правок кода

На сервере:

```bash
cd /opt/kamgu
bash deploy/remote-update.sh
```

Если меняли только ключи LLM в `backend/.env` (без обновления кода):

```bash
cd /opt/kamgu
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate api
```

Обычного `docker compose restart api` недостаточно — нужен `--force-recreate`.

---

## Краткая памятка по файлам

| Файл | Назначение |
|------|------------|
| `/opt/kamgu/.env` | `POSTGRES_*`, `SNAPSHOT_DATABASE_URL`, `CORS_ORIGINS`, `VITE_API_BASE_URL` |
| `/opt/kamgu/backend/.env` | Ключи LLM, источники данных |
| `docker-compose.prod.yml` | Сервисы `postgres` и `api` |
| `deploy/remote-update.sh` | Обновление кода + фронт + Docker |
| `deploy/snapshot_dsn.py` | Генерация `SNAPSHOT_DATABASE_URL` |

---

## Чеклист готовности

- [ ] Docker и Docker Compose установлены, пользователь в группе `docker`
- [ ] Репозиторий в `/opt/kamgu`
- [ ] В `.env` заданы `POSTGRES_*` и `SNAPSHOT_DATABASE_URL`
- [ ] В `backend/.env` задан рабочий ключ LLM
- [ ] `curl http://127.0.0.1:8080/health` возвращает ok
- [ ] DNS доменов указывает на сервер
- [ ] Caddy/Nginx настроены, HTTPS работает
- [ ] Сайт открывается, API доступен с домена
- [ ] `CORS_ORIGINS` совпадает с URL сайта (со схемой `https://`)

Если что-то не запускается — см. [README.md](README.md) (типичные ошибки, CI/CD, таймауты прокси).
