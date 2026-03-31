# Развёртывание KamGU на VPS (Ubuntu)

Краткий чеклист для продакшена: ОС, Docker, секреты, прокси и связка фронта с API.

## 1. Сервер (Ubuntu Server 22.04/24.04 LTS)

### Фаервол

- Должны быть доступны **22** (SSH), **80** и **443** (HTTP/HTTPS). В панели VPS (Timeweb и др.) или через `ufw`: `sudo ufw allow OpenSSH`, `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`, затем `sudo ufw enable`.
- Порт **5432** (PostgreSQL) наружу не открывайте, если БД используется только на этом же сервере (так и задумано в `docker-compose.prod.yml`).

### Пользователь для деплоя и SSH-ключ

Работать постоянно под `root` нежелательно. Удобный вариант — отдельный пользователь (например `deploy`) и вход по **SSH-ключу** без пароля.

**На своём компьютере** (если ключа ещё нет):

```bash
ssh-keygen -t ed25519 -C "vps kamgu" -f ~/.ssh/kamgu_vps
```

Публичный ключ — файл `~/.ssh/kamgu_vps.pub`.

**На сервере** под `root` или пользователем с `sudo`:

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy   # если нужны права sudo (Docker ниже удобнее ставить через sudo)
```

Переключитесь на нового пользователя и примите ключ:

```bash
sudo su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

Вставьте **одну строку** из `kamgu_vps.pub`, сохраните файл. Права:

```bash
chmod 600 ~/.ssh/authorized_keys
```

Выйдите с сервера. С локальной машины проверьте вход:

```bash
ssh -i ~/.ssh/kamgu_vps deploy@IP_СЕРВЕРА
```

При необходимости в `~/.ssh/config` на клиенте:

```text
Host kamgu-vps
    HostName IP_СЕРВЕРА
    User deploy
    IdentityFile ~/.ssh/kamgu_vps
```

Дальше в инструкции считаем, что вы работаете под этим пользователем (где нужен `sudo` — команды указаны явно).

### Docker Engine и Compose

Официальная инструкция: [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Кратко по шагам:

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
```

Проверка:

```bash
sudo docker run --rm hello-world
docker compose version
```

Чтобы **не вводить `sudo` перед каждым `docker`**, добавьте пользователя в группу `docker` и перелогиньтесь:

```bash
sudo usermod -aG docker deploy
# выйдите из SSH и зайдите снова, затем:
docker run --rm hello-world
```

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
- **CD:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — SSH на сервер, выполняется [remote-update.sh](remote-update.sh) (`git pull` + `docker compose up -d --build`).
- **Проверка API:** [`.github/workflows/healthcheck.yml`](../.github/workflows/healthcheck.yml) — раз в 10 минут запрос к URL из переменной `API_HEALTH_URL`.

### Настройка автодеплоя в GitHub

1. Репозиторий на GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Создайте секреты (значения с сервера и вашего SSH):

| Secret | Пример значения |
|--------|-----------------|
| `DEPLOY_HOST` | `85.239.xx.xx` или домен SSH |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Содержимое **приватного** ключа (файл `~/.ssh/kamgu_vps` целиком, включая `BEGIN`/`END`) |
| `DEPLOY_PATH` | `/opt/kamgu` — каталог, где на сервере лежит `git clone` |

3. На сервере в `/opt/kamgu` должен быть настроен доступ к GitHub: **HTTPS** с токеном или **SSH** с [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) / ключом пользователя, иначе `git pull` в `remote-update.sh` не сработает.

4. После push в ветку **`main`** (если менялись `backend/`, `front/`, `deploy/` или `docker-compose.prod.yml`) workflow **Deploy** запустится сам. Вручную: вкладка **Actions** → **Deploy** → **Run workflow**.

### Мониторинг `/health` из GitHub

1. **Settings** → **Secrets and variables** → **Actions** → вкладка **Variables** → **New repository variable**.
2. Имя: **`API_HEALTH_URL`**, значение: **`https://api.ваш-домен.ru/health`** (полный URL эндпоинта).
3. Workflow **Health check** по расписанию проверяет ответ и падает, если не `{"status":"ok"}`. Включите уведомления GitHub по e-mail для упавших workflow или смотрите вкладку **Actions**.

Ручной прогон: **Actions** → **Health check** → **Run workflow**.

Если переменная `API_HEALTH_URL` не задана, job завершится с ошибкой — это напоминание её заполнить.

### Если секреты деплоя не заданы

Используйте только ручной деплой на сервере: `git pull` и `docker compose` из п. 3.

## 7. Альтернатива: GitLab CI

Файл [`.gitlab-ci.yml`](../.gitlab-ci.yml) дублирует проверки CI для репозитория на GitLab.
