# Браузерный UI для KamGU Research Digest

**Vite + React + TypeScript + shadcn/ui** (preset из `npx shadcn@latest init --preset b1FkdNWmh --template vite` — после первого скана проект дополнен Tailwind и alias; при необходимости переинициализируйте shadcn в этой папке).

## Запуск вместе с бэкендом

1. Поднимите API из каталога `backend` (порт **8080** по умолчанию), см. [backend/README.md](../backend/README.md).
2. В бэкенде по умолчанию разрешён CORS для `http://localhost:5173` и `http://127.0.0.1:5173` (`CORS_ORIGINS`).

```bash
cd front
cp .env.example .env   # при необходимости
npm install
npm run dev
```

Откройте в браузере URL из консоли (обычно **http://localhost:5173**).

- **Дайджест** — форма `POST /digests`, результат: вкладки RU/EN, карточки, таблица публикаций, мета.
- **Ежемесячный** — `POST /digests/monthly`, плюс таблицы структурированного диффа; при секрете на сервере укажите ключ в настройках или в поле формы.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `VITE_API_BASE_URL` | URL API (по умолчанию `http://localhost:8080`). В приложении можно переопределить в «Настройки» (сохраняется в браузере). |
| `VITE_MONTHLY_INTERNAL_KEY` | Необязательный ключ для `X-Internal-Key` на ежемесячном эндпоинте. |

Ключи LLM задаются только на сервере (`.env` бэкенда), не в фронте.

## Сборка

```bash
npm run build
npm run preview
```
