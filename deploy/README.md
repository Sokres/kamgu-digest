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

Скопируйте `front/dist` на сервер и раздавайте через прокси как статику **или** настройте автосборку при деплое (следующий раздел).

На бэкенде в `.env` укажите `CORS_ORIGINS` со схемой и хостом страницы (например `https://app.example.com`), либо осознанно `*` только для внутренних тестов.

### Автосборка фронта на сервере (remote-update)

Скрипт [remote-update.sh](remote-update.sh) после `git pull` при наличии **Node.js/npm** выполняет `npm ci && npm run build` в `front/`, если в **корневом** `.env` задан **`VITE_API_BASE_URL`** (без завершающего слэша), например `https://api.24msg.ru`. Итоговая статика — в `front/dist`; укажите этот путь в Caddy/Nginx (`root`) или задайте **`FRONT_STATIC_ROOT`** — тогда `dist` синхронизируется туда (`rsync`, пакет `rsync` должен быть установлен). Отключить сборку фронта: **`DEPLOY_BUILD_FRONT=0`**.

На VPS один раз установите Node **20+** (например [NodeSource](https://github.com/nodesource/distributions) или пакет `nodejs` из дистрибутива). Без `npm` скрипт только предупредит в логе и обновит API в Docker.

### Интерфейс на сайте «старый», API уже новый

1. В логе деплоя (GitHub Actions → job **Deploy** или ручной `bash deploy/remote-update.sh`) должны быть строки **`сборка фронта`** и **`фронт собран`**. Если видите **`фронт НЕ собран`** — в **`/opt/kamgu/.env`** (корень репо, не `backend/.env`) добавьте **`VITE_API_BASE_URL=https://ваш-api...`** и при необходимости установите **`npm`**.
2. **Caddy/Nginx** для домена приложения должны отдавать статику из **`/opt/kamgu/front/dist`** (или из **`FRONT_STATIC_ROOT`**, если его задали). Если `root` указывает на другой каталог — сайт останется старым.
3. Сбросьте кэш браузера или откройте сайт в режиме инкогнито.
4. Проверка на сервере: `ls -la /opt/kamgu/front/dist/assets/` — время файлов должно совпадать с последним деплоем.

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
