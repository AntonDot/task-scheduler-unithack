# Victory Group — Task Scheduler

Минималистичный таск-менеджер для digital-агентства со встроенным AI-ассистентом, системой автоматизаций и уведомлениями в реальном времени.

**🔗 Live Demo: [https://unithack.littlesuns.ru/](https://unithack.littlesuns.ru/)**

## 🏗 Архитектура системы

Проект построен на микросервисной архитектуре, где каждый компонент отвечает за свою область ответственности:

```
services/
  core-api/          # FastAPI 8000 — Основной бэкенд (CRUD, RBAC, WebSocket, уведомления)
  automation-worker/ # Python — Воркер RabbitMQ, выполняет логику автоматизаций
  ml-worker/         # FastAPI 8001 — Интеграция с LLM, парсинг отзывов, умные черновики
  mock-review-board/ # FastAPI 8002 — Эмуляция внешней площадки с отзывами
apps/
  web/               # React 18 + TS — SPA / PWA приложение (Vite)
jobs/
  review-scraper/    # Python — Cron-скрейпер негативных отзывов → ml-worker
```

**Инфраструктура:**
- **PostgreSQL 16**: Основное хранилище данных; через `LISTEN/NOTIFY` раздаёт события WebSocket всем репликам core-api.
- **S3 (RustFS)**: Хранилище вложений задач; в облаке заменяется любым S3 через `CORE_S3_*`.
- **RabbitMQ 3**: Очередь событий для асинхронных автоматизаций (профиль `full`).
- **WebSocket**: Реал-тайм обновления доски и «колокольчика» уведомлений.
- **Docker Compose**: Контейнеризация и оркестрация всех сервисов.

Приложение сделано по методологии «12 факторов» — разбор по каждому пункту в [Отчёт.md](Отчёт.md).

---

## 🛠 Технологический стек

### Backend
- **Язык:** Python 3.12
- **Фреймворк:** FastAPI (асинхронный)
- **ORM:** SQLAlchemy 2.0 (async) + Alembic (миграции)
- **Очереди:** aio_pika (RabbitMQ)
- **Валидация:** Pydantic v2
- **Linter/Formatter:** Ruff

### Frontend
- **Ядро:** React 18 + TypeScript
- **Сборка:** Vite
- **State Management:** Zustand + TanStack Query (React Query)
- **Drag-n-Drop:** @dnd-kit
- **Styling:** Vanilla CSS (современные переменные и Flexbox/Grid)

### AI & ML
- **Модель:** Anthropic Claude API (по умолчанию `ML_USE_MOCK_LLM=true` для демо)
- **Задачи:** Генерация черновиков задач, классификация отзывов, извлечение сущностей.

---

## 🚀 Быстрый старт

### 1. Подготовка окружения
```bash
# Клонируйте репозиторий и перейдите в него
cp .env.example .env   # весь конфиг деплоя; секреты для сервера поменяйте
```

### 2. Запуск в Docker (рекомендуется)
```bash
# Таск-менеджер: postgres, s3, migrate (разово), core-api, web
docker compose up -d --build

# Плюс автоматизации и AI: rabbitmq, automation-worker, ml-worker, отзовик, скрейпер
docker compose --profile full up -d --build
```
Сначала отрабатывает разовый процесс `migrate` (миграции Alembic, бакет S3, демо-данные при `CORE_SEED_DEMO=true`), после него стартует core-api.

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Swagger UI (Core API)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Консоль S3 (RustFS)**: [http://localhost:9001](http://localhost:9001)
- **RabbitMQ Management** (профиль `full`): [http://localhost:15672](http://localhost:15672)

Порты на хосте переопределяются переменными `WEB_PORT`, `CORE_API_PORT`, `POSTGRES_PORT`, `S3_PORT`, `ML_WORKER_PORT`, `REVIEW_BOARD_PORT`.

### 3. Релиз и деплой
```bash
# Сборка: образы с тегом коммита (в CI — .github/workflows/release.yml, пуш в GHCR)
APP_VERSION=$(git rev-parse --short=7 HEAD) docker compose build
# Запуск релиза: образы + .env сервера, без сборки на сервере; откат — прошлый тег
DEPLOY_HOST=user@server APP_VERSION=<tag> ./scripts/deploy.sh
```
Пакеты GHCR по умолчанию приватные: на сервере один раз выполните `docker login ghcr.io` (токен с `read:packages`). Порты PostgreSQL, S3 и RabbitMQ публикуются только на `BIND_ADDR` (по умолчанию `127.0.0.1`).

### 4. Демо-пользователи
Для входа не требуется пароль (если `CORE_DEV_LOGIN=true`):

| Email | Роль | Доступ к проектам |
|---|---|---|
| `d.morozov@victorygroup.ru` | **OWNER** | onegin-park, zhk-bereg |
| `a.kozlova@victorygroup.ru` | **ASSIGNEE** | onegin-park |
| `i.petrov@victorygroup.ru` | **ASSIGNEE** | zhk-bereg |

---

## 🤖 Автоматизации и Вебхуки

Система поддерживает мощный конструктор правил: **«Триггер → Условие → Действие»**.

### Внешние вебхуки (Ingress)
Для интеграции с внешними системами (GitHub, CI/CD, CRM) используйте триггеры **GitHub событие** или **Универсальный вебхук**.

**Формат запроса:**
- **URL:** Генерируется в UI при сохранении автоматизации.
- **Метод:** `POST`
- **Body (JSON):**
```json
{
  "event_type": "incident",
  "payload": {
    "title": "Server down",
    "severity": "high"
  }
}
```

**Доступ к полям:**
- В условиях: используйте имя поля напрямую (напр. `title` или `payload.user`).
- В шаблонах: `{{title}}`, `{{task.urgency}}`.

---

## 👨‍💻 Разработка

### Локальный запуск (без Docker)
Требуется Python 3.12 и Node.js 18+.

Бэкинг-сервисы удобно взять из compose: `docker compose up -d postgres s3`.

**Backend:**
```bash
cd services/core-api
uv sync --frozen --extra dev           # зависимости строго по uv.lock
set -a; source ../../.env; set +a      # конфиг — только из окружения
export CORE_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/taskscheduler
export CORE_S3_ENDPOINT_URL=http://localhost:9000
uv run sh scripts/migrate.sh           # разовый админ-процесс
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd apps/web
npm ci --legacy-peer-deps
npm run dev    # проксирует /api и /ws на CORE_API_URL (по умолчанию http://localhost:8000)
```

### Тестирование
```bash
# Unit & Integration тесты (в каждом сервисе)
cd services/core-api && uv sync --frozen --extra dev && uv run pytest

# E2E тесты (требуют docker compose --profile full up)
pytest tests/e2e -v -m e2e
```

---

## 📜 Лицензия
Victory Group — Внутренняя разработка для повышения эффективности digital-команд.
