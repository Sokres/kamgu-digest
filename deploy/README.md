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
ssh -i ~/.ssh/kamgu_vps deploy@85.239.60.115
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

Файл `.env` в корне репозитория не коммитится. Переменные `POSTGRES_*` нужны Compose для сервиса `postgres`. Для контейнера `api` в **`.env` обязательна строка `SNAPSHOT_DATABASE_URL`** — подключение к сервису `postgres` по внутренней сети (не `127.0.0.1`).

**Пароль и спецсимволы:** в URL вида `postgresql://user:password@host` символы **`@`, `:`, `/`, `?`** в пароле **ломают** разбор строки (ошибка вроде `failed to resolve host '"...@postgres'`). Сгенерируйте корректный URL из текущего `.env`:

```bash
cd /opt/kamgu   # или корень клона
python3 deploy/snapshot_dsn.py
```

Добавьте в `.env` строку **`SNAPSHOT_DATABASE_URL=`** с выводом скрипта (одна строка, без пробелов вокруг `=`). Альтернатива — задать **`POSTGRES_PASSWORD`** только из букв и цифр без `@` и `:`, тогда можно собрать URL вручную.

Скрипт: [snapshot_dsn.py](snapshot_dsn.py).

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

### Как посмотреть конфиг **Caddy** на сервере

Обычно главный файл — **`/etc/caddy/Caddyfile`**. Нужен **`sudo`**:

```bash
sudo cat /etc/caddy/Caddyfile
```

Найдите блок с вашим доменом приложения (например `kamgu.24msg.ru` `{` … `}`). Для SPA смотрите строки **`root * /путь/к/front/dist`**, **`file_server`**, **`try_files {path} /index.html`**. Путь после **`root`** должен совпадать с **`/opt/kamgu/front/dist`** (или с каталогом, куда копирует **`FRONT_STATIC_ROOT`**).

Быстрый поиск по домену и по `root`:

```bash
sudo grep -RniE 'kamgu|24msg|root \*' /etc/caddy/ 2>/dev/null
```

После правок: **`sudo caddy validate --config /etc/caddy/Caddyfile`** и **`sudo systemctl reload caddy`** (или `restart`).

Если Caddy в **Docker**, смотрите смонтированный Caddyfile в `docker compose` / `docker inspect` контейнера.

## 5. Фронтенд (Vite)

При сборке задайте URL API:

```bash
cd front
export VITE_API_BASE_URL="https://api.example.com"   # или ваш URL
npm ci && npm run build
```

Скопируйте `front/dist` на сервер и раздавайте через прокси как статику **или** настройте автосборку при деплое (следующий раздел).

На бэкенде в `.env` укажите `CORS_ORIGINS` со схемой и хостом страницы (например `https://app.example.com`), либо осознанно `*` только для внутренних тестов.

### Автосборка фронта на сервере (remote-update)

Скрипт [remote-update.sh](remote-update.sh) после `git pull` при наличии **Node.js/npm** выполняет `npm ci && npm run build` в `front/`, если в **корневом** `.env` задан **`VITE_API_BASE_URL`** (без завершающего слэша), например `https://api.24msg.ru`. Итоговая статика — в `front/dist`; укажите этот путь в Caddy/Nginx (`root`) или задайте **`FRONT_STATIC_ROOT`** — тогда `dist` синхронизируется туда (`rsync`, пакет `rsync` должен быть установлен). Отключить сборку фронта: **`DEPLOY_BUILD_FRONT=0`**.

На VPS один раз установите Node **20+** (например [NodeSource](https://github.com/nodesource/distributions) или пакет `nodejs` из дистрибутива). Без `npm` скрипт только предупредит в логе и обновит API в Docker.

Если в логе **`tsc: not found`** или **`vite: not found`**, на хосте, скорее всего, **`NODE_ENV=production`**: тогда `npm ci` не ставит **devDependencies** (TypeScript, Vite). Скрипт `remote-update.sh` перед `npm ci` выставляет **`NODE_ENV=development`**, перед `npm run build` — **`production`**. Предупреждения **`TAR_ENTRY_ERROR`** при установке иногда лечатся удалением каталога **`front/node_modules`** и повторным деплоем.

### Интерфейс на сайте «старый», API уже новый

1. В логе деплоя (GitHub Actions → job **Deploy** или ручной `bash deploy/remote-update.sh`) должны быть строки **`сборка фронта`** и **`фронт собран`**. Если видите **`фронт НЕ собран`** — в **`/opt/kamgu/.env`** (корень репо, не `backend/.env`) добавьте **`VITE_API_BASE_URL=https://ваш-api...`** и при необходимости установите **`npm`**.
2. **Caddy/Nginx** для домена приложения должны отдавать статику из **`/opt/kamgu/front/dist`** (или из **`FRONT_STATIC_ROOT`**, если его задали). Типичная ошибка: в Caddy стоит **`root * /var/www/kamgu/front/dist`**, а `remote-update.sh` собирает в **`/opt/kamgu/front/dist`** — тогда деплой «зелёный», а интерфейс не меняется. Исправление: либо в Caddy указать **`root * /opt/kamgu/front/dist`** и `sudo systemctl reload caddy`, либо в корневом `.env` задать **`FRONT_STATIC_ROOT=/var/www/kamgu/front/dist`**, чтобы скрипт копировал `dist` в каталог из `root`.
3. Сбросьте кэш браузера или откройте сайт в режиме инкогнито.
4. Проверка на сервере: `ls -la /opt/kamgu/front/dist/assets/` — время файлов должно совпадать с последним деплоем.

### Проверка на сервере: фронт собрался и тот же путь, что у Caddy/Nginx

Подключитесь по SSH под пользователем деплоя, **`cd` в каталог клона** (например `/opt/kamgu`). Дальше по шагам.

**1. Есть ли свежая сборка на диске**

```bash
test -f front/dist/index.html && echo "dist есть" || echo "dist НЕТ — сборка не выполнялась или упала"
ls -la front/dist/index.html
find front/dist/assets -name '*.js' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -3
# или без find -printf (macOS): ls -lt front/dist/assets/*.js | head -5
```

Даты файлов должны быть **несколько минут/часов назад**, в момент последнего успешного деплоя. Если `index.html` старше нескольких дней — фронт **не пересобирался** (смотрите лог job **Deploy** в GitHub: есть ли строки **`сборка фронта`** / **`фронт собран`**, нет ли **`фронт НЕ собран`** или **`npm не найден`**).

**2. Задан ли URL API для сборки**

```bash
grep -E '^VITE_API_BASE_URL=' .env || echo "Нет VITE_API_BASE_URL — скрипт пропускает npm run build"
grep -E '^DEPLOY_BUILD_FRONT=' .env || true
```

Без **`VITE_API_BASE_URL=`** в **корневом** `.env` скрипт **намеренно не собирает** фронт.

**3. Совпадает ли каталог с тем, откуда отдаёт сайт**

Узнайте **`root`** (или `alias`) для домена приложения в **Caddy** или **Nginx**. Он должен указывать на **`…/front/dist`** внутри клона **или** на каталог **`FRONT_STATIC_ROOT`**, если вы его задали в `.env`:

```bash
grep -E '^FRONT_STATIC_ROOT=' .env || echo "FRONT_STATIC_ROOT не задан — статика должна быть в front/dist репозитория"
```

Если в конфиге прокси, например, `/var/www/kamgu/dist`, а сборка лежит в `/opt/kamgu/front/dist` и **`FRONT_STATIC_ROOT` не задан** — в браузере будет **старая** копия из `/var/www/...`.

**4. Совпадает ли имя файла JS в HTML с файлами на диске**

```bash
grep -oE 'assets/[^"]+\.js' front/dist/index.html | head -3
ls front/dist/assets/ | head -10
```

Откройте сайт в браузере → **Просмотр кода** / **Network** → посмотрите путь к `*.js`. Имя вроде `index-xxxxx.js` должно **совпадать** с тем, что в `front/dist/index.html` на сервере. Если в браузере запрашивается другой хеш — кэш или другой `root`.

**5. Кэш**

В режиме **инкогнито** или с отключённым кэшем (DevTools) откройте страницу ещё раз.

### Ошибка `.env: line N: …: command not found` при деплое

Корневой `.env` **нельзя** подключать целиком через `source` в bash, если в значениях есть **пробелы без кавычек**. Скрипт `remote-update.sh` читает только нужные ключи (`VITE_*`, `FRONT_STATIC_ROOT`, `DEPLOY_BUILD_FRONT`). Строки с произвольным текстом оформляйте как **`KEY="значение с пробелами"`**. Для Docker Compose значения с пробелами тоже лучше в кавычках.

Если в логе CI ошибка остаётся **после** обновления репозитория, причина часто в том, что **на диске уже новый `remote-update.sh`, а по SSH выполняется старая копия из памяти** (bash подгружает файл один раз в начале). Текущий скрипт после `git pull` делает **`exec bash`** самого себя, чтобы подхватить свежую версию. **Один раз** на сервере выполните вручную: `cd /opt/kamgu && git pull && bash deploy/remote-update.sh`, чтобы гарантированно запустить актуальный скрипт; дальше деплой из GitHub будет вести себя правильно.

## 6. CI/CD

- **CI:** GitHub Actions [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — тесты бэкенда и сборка фронта.
- **CD:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — SSH на сервер, выполняется [remote-update.sh](remote-update.sh) (`git pull`, при настройке — сборка фронта, затем `docker compose up -d --build`).
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

3. **Доступ Git с сервера к GitHub (обязательно для `git pull`).** Секреты `DEPLOY_*` в репозитории нужны только тому, чтобы **GitHub Actions подключался к VPS по SSH**. Отдельно на **самом сервере**, в каталоге клона (`DEPLOY_PATH`, чаще всего `/opt/kamgu`), пользователь `DEPLOY_USER` при выполнении [remote-update.sh](remote-update.sh) запускает `git pull --ff-only`. Для **приватного** репозитория (или если без учётных данных `git` не может сходить на GitHub) этот шаг завершится ошибкой, пока не настроена аутентификация **между сервером и GitHub**.

   Выберите один из вариантов и проверьте его **до** того, как полагаться на автодеплой.

   **Вариант A — HTTPS + Personal Access Token**

   - В GitHub: **Settings → Developer settings → Personal access tokens** — создайте токен с правом читать репозиторий: для **classic** достаточно scope `repo` (приватный репозиторий); для **fine-grained** — доступ к нужному репо, разрешение **Contents: Read-only**.
   - На сервере под пользователем деплоя:
     - Убедитесь, что `origin` указывает на HTTPS: `cd /opt/kamgu && git remote -v` (должно быть `https://github.com/...`).
     - Сохраните учётные данные (пример через `~/.git-credentials`, файл только для пользователя `deploy`, права `600`):

       ```bash
       cd /opt/kamgu
       printf 'https://%s:%s@github.com\n' "ВАШ_GITHUB_LOGIN" "ВАШ_ТОКЕН" >> ~/.git-credentials
       chmod 600 ~/.git-credentials
       git config --global credential.helper store
       ```

       Вместо логина GitHub допускает и вариант с фиксированным именем `git` и токеном в качестве пароля — см. [документацию](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).

     - Проверка: `git fetch` и `git pull --ff-only` в `/opt/kamgu` без запроса пароля.

   **Вариант B — SSH: [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)** (удобно для сервера: ключ только у этого репозитория)

   - На сервере сгенерируйте пару **без пароля** и не переиспользуйте ключ от входа по SSH в систему:

     ```bash
     ssh-keygen -t ed25519 -f ~/.ssh/github_kamgu_deploy -N "" -C "kamgu deploy"
     ```

   - Публичный ключ (`~/.ssh/github_kamgu_deploy.pub`) добавьте в **репозиторий** на GitHub: **Settings → Deploy keys → Add deploy key**, включите **Allow write access** только если осознанно нужен push с сервера (для `git pull` достаточно read-only).
   - Настройте SSH для хоста `github.com` и переключите `origin` на SSH:

     ```text
     # ~/.ssh/config
     Host github.com
       HostName github.com
       User git
       IdentityFile ~/.ssh/github_kamgu_deploy
       IdentitiesOnly yes
     ```

     **Ключ хоста GitHub (`known_hosts`).** Если при `git pull` или `ssh -T` видите **`Host key verification failed`**, значит SSH к `github.com` ещё не доверяет серверу: в неинтерактивном деплое нельзя нажать «yes», поэтому заранее добавьте отпечатки (под тем же пользователем, что делает `git`, обычно `deploy`):

     ```bash
     mkdir -p ~/.ssh
     chmod 700 ~/.ssh
     ssh-keyscan -t ed25519,rsa,ecdsa github.com >> ~/.ssh/known_hosts
     chmod 644 ~/.ssh/known_hosts
     ```

     Проверка: `ssh -T git@github.com` (ожидается приветствие про успешную аутентификацию или сообщение про shell access).

     ```bash
     cd /opt/kamgu
     git remote set-url origin git@github.com:OWNER/REPO.git
     ssh -T git@github.com
     git pull --ff-only
     ```

   **Вариант C — SSH-ключ пользователя GitHub** — если `origin` уже через `git@github.com:...` и на сервере лежит **ваш** приватный ключ, сопоставленный с ключом в профиле GitHub. Для продакшена чаще предпочитают отдельный **deploy key**, чтобы компрометация сервера не трогала ваш личный доступ ко всем репозиториям.

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
