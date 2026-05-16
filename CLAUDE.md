# Victory Group — Task Scheduler

Минималистичный таск-менеджер для digital-агентства с Kanban-доской, AI-черновиками, автоматизациями и системой уведомлений.

## Архитектура

```
services/
  core-api/          FastAPI 8000 — основной бэкенд (CRUD, RBAC, WebSocket, уведомления)
  automation-worker/ Python-воркер — читает очередь RabbitMQ, выполняет автоматизации
  ml-worker/         FastAPI 8001 — LLM-парсинг отзывов, webhook-обработка инцидентов
  mock-review-board/ FastAPI 8002 — фейковый отзовик для демо
apps/
  web/               React 18 + TypeScript + Vite — SPA / PWA
jobs/
  review-scraper/    Cron-скрейпер негативных отзывов → ml-worker
tests/
  e2e/               httpx + pytest против живых сервисов
```

**Инфраструктура:** PostgreSQL 16, RabbitMQ 3, Docker Compose, GitHub Actions.

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d --build
# фронт: http://localhost:3000
# swagger: http://localhost:8000/docs
```

Демо-пользователи и проекты создаются автоматически при первом запуске (seed в `services/core-api/scripts/`).

## Демо-пользователи

| Email | Роль | Проект |
|---|---|---|
| `d.morozov@victorygroup.ru` | OWNER | onegin-park, zhk-bereg |
| `a.kozlova@victorygroup.ru` | ASSIGNEE | onegin-park |
| `i.petrov@victorygroup.ru` | ASSIGNEE | zhk-bereg |

Логин без пароля: `POST /api/v1/auth/token {"email": "..."}` — `CORE_DEV_LOGIN=true`.

## Стек

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, aio_pika
- **Frontend:** React 18, TypeScript, Vite, dnd-kit, TanStack Query, Zustand
- **AI:** Anthropic Claude API (по умолчанию `ML_USE_MOCK_LLM=true`)
- **Linter/formatter:** Ruff (обязателен в CI)

## Переменные окружения

Каждый сервис имеет свой префикс:

| Сервис | Префикс | Пример |
|---|---|---|
| core-api | `CORE_` | `CORE_DATABASE_URL`, `CORE_SERVICE_TOKEN` |
| automation-worker | `AUTOMATION_` | `AUTOMATION_DATABASE_URL`, `AUTOMATION_SERVICE_TOKEN` |
| ml-worker | `ML_` | `ML_LLM_API_KEY`, `ML_USE_MOCK_LLM` |
| review-scraper | `SCRAPER_` | `SCRAPER_REVIEW_BOARD_URL` |

Дефолтный service-token для межсервисного общения: `dev-service-token` (заголовок `X-Service-Token`).

## RBAC

Роли: `OWNER` > `ASSIGNEE`. Хранятся в таблице `user_projects`.

- OWNER — полный доступ, назначение пользователей, перевод в DONE, удаление задач
- ASSIGNEE — редактирование своих задач, запрещено: смена `assignee_id`, `urgency`, `project_id`

Гарды: `get_current_user`, `require_project_access`, `require_owner` в `app/dependencies.py`.

## Ключевые модели

```
User → UserProject (роль в проекте) → Project → BoardColumn → Task
Task → AuditLog, Comment, Attachment, Tag
Task → TaskAssignee (co-assignees, many-to-many)
Automation → AutomationLog
User → PushSubscription (web-push)
```

Поле приоритета задачи называется **`urgency`** (не `priority`). Значения: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.

## Автоматизации

Конфигурация хранится в `automations.config` (JSONB):

```json
{
  "trigger": {"type": "column_changed", "filters": {}},
  "conditions": [{"type": "column_equals", "params": {"column_id": 5}}],
  "actions": [{"type": "send_notification", "params": {"message": "..."}}]
}
```

**Типы триггеров:** `task_created`, `task_updated`, `column_changed`

**Типы условий:** `column_equals`, `field_value_equals`, `and`, `or`

**Типы действий:** `change_column` / `change_status`, `assign_user`, `send_notification`

### Поток событий

```
core-api → RabbitMQ (automation.events) → automation-worker → core-api (internal endpoints)
```

**Критически важно — структура payload по типу события:**

| Событие | Где лежат изменённые поля |
|---|---|
| `task_created` | верхний уровень payload (`column_id`, `urgency`, ...) |
| `task_updated` | вложены в `payload["changes"]` |
| `column_changed` | `payload["new_column_id"]`, `payload["old_column_id"]` |

Условия в `automation-worker/main.py::evaluate_condition` должны учитывать все три структуры — иначе условие не сработает для `task_updated`.

### Уведомления от автоматизации

Цепочка `send_notification` действия:
1. `POST /api/v1/push/internal/notify` → web-push (требует настройки VAPID)
2. `POST /api/v1/tasks/internal/automation-event` → создаёт `AuditLog(action="automation_triggered")` → попадает в колокольчик уведомлений

Колокольчик (`GET /api/v1/notifications`) показывает AuditLog-записи за последние 14 дней для задач, где пользователь является assignee или co-assignee.

## Внутренние эндпоинты

Защищены заголовком `X-Service-Token`:

```
POST /api/v1/push/internal/notify          — push-уведомление пользователю
POST /api/v1/tasks/internal/automation-event — WS-broadcast + AuditLog
```

## WebSocket

`ws://<host>/ws/{project_id}` — broadcast реального времени по каналу проекта.
События: `task_created`, `task_updated`, `task_column_changed`, `task_deleted`.

## Миграции

```bash
cd services/core-api
alembic upgrade head           # применить
alembic revision --autogenerate -m "описание"  # создать
```

Файлы: `alembic/versions/NNNN_*.py`.

## Запуск тестов

```bash
# Backend (каждый сервис в своём venv)
cd services/core-api  && python -m pytest tests/ -v   # ~28 тестов
cd services/ml-worker && python -m pytest tests/ -v   # ~11 тестов
cd jobs/review-scraper && python -m pytest tests/ -v  # ~22 теста

# Frontend
cd apps/web && npx vitest run   # ~26 тестов

# E2E (требуют docker compose up)
python -m pytest tests/e2e -v -m e2e
```

Линтинг Python: `ruff check . && ruff format --check .` — обязателен перед коммитом.

## E2E-тесты

Паттерн: httpx синхронный клиент + pytest, живые сервисы на localhost.
Конфигурация через env: `E2E_CORE_API_URL`, `E2E_ML_WORKER_URL`, `E2E_REVIEW_BOARD_URL`.

Фикстуры в `tests/e2e/conftest.py`: `client`, `owner_headers`, `assignee_onegin_headers`, `assignee_bereg_headers`, `onegin_project`, `bereg_project`.

Polling-паттерн для асинхронных событий — см. `_wait_for_task` в `test_incident_flow.py`.

## CI

GitHub Actions (`.github/workflows/main.yml`), запускается на PR в `main`:
1. `backend-quality` — Ruff + Pytest (матрица по сервисам)
2. `frontend-quality` — tsc + Vitest + Vite build
3. `integration-smoke` — `docker compose up` → smoke + e2e тесты

## Важные gotchas

- `automation-worker` не имеет HTTP-эндпоинта для healthcheck — нет способа напрямую проверить, работает ли он, кроме как через лог автоматизаций.
- Web-push (VAPID) по умолчанию отключён (`CORE_VAPID_PRIVATE_KEY` не задан). `send_push_to_user` молча пропускает отправку — это нормально.
- Колонки задачи — это `BoardColumn` (id: int), а не статус-строки. `task_created` публикует `column_id`, drag-n-drop использует `PATCH /tasks/{id}/column` → событие `column_changed`.
- `system@victory.local` — служебный пользователь, создаётся лениво при первом вызове `internal_automation_event`. Его AuditLog-записи попадают в колокольчик (`automation_triggered` разрешён даже от самого себя).
- Поле `description` у задач — rich-text (JSON BlockEditor), не plain text. Поиск @mentions работает через `ilike` по строковому представлению.
