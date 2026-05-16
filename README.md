# Victory Group — Task Scheduler

Минималистичный таск-менеджер со встроенным AI-ассистентом и системой автоматизаций для digital-агентства Victory Group. 

## Архитектура

| Сервис | Порт | Описание |
|--------|------|----------|
| `core-api` | 8000 | FastAPI — CRUD задач, RBAC, WebSockets, вебхуки |
| `automation-worker` | — | Воркер RabbitMQ — выполняет автоматизации |
| `ml-worker` | 8001 | ML Worker — LLM-парсинг, webhook-обработка |
| `mock-review-board` | 8002 | Фейковый отзовик для демо |
| `review-scraper` | — | Cron-скрейпер негативных отзывов |
| `web` | 3000 (prod) / 5173 (dev) | React SPA + PWA |
| `postgres` | 5432 | PostgreSQL 16 |

## Быстрый старт

```bash
# 1. Скопировать переменные окружения
cp .env.example .env

# 2. Поднять весь стек
docker compose up -d --build

# 3. Открыть фронтенд
open http://localhost:3000
```

Демо-пользователи и задачи создаются автоматически при первом запуске.

---

## Автоматизации

### Типы триггеров

| Тип | Описание | Нужен webhook_token |
|-----|----------|---------------------|
| `task_created` | Задача создана в проекте | нет |
| `task_updated` | Любое изменение задачи | нет |
| `column_changed` | Задача переведена в другую колонку | нет |
| `review_received` | Новый отзыв из review-board | да |
| `github_event` | GitHub PR / issue / push | да |
| `webhook_generic` | Произвольный внешний вебхук | да |

Автоматизации с внешним триггером (`review_received`, `github_event`, `webhook_generic`) получают уникальный **Webhook URL** автоматически при создании. Его можно скопировать во вкладке **Custom Triggers**.

---

### Шаблоны — синтаксис `{{переменная}}`

В полях `message`, `title`, `description` поддерживается подстановка значений из события.

**Синтаксис:** `{{field}}` или `{{nested.field.subfield}}`

Одинарные фигурные скобки `{field}` **не работают** — только двойные.

---

### Переменные по типу триггера

#### `webhook_generic`

Ты отправляешь запрос:
```json
{
  "event_type": "alert",
  "external_event_id": "evt-001",
  "payload": {
    "title": "CPU spike",
    "server": "prod-01",
    "severity": "critical"
  }
}
```

В шаблонах доступно:

| Переменная | Значение | Пример |
|------------|----------|--------|
| `{{title}}` | из `payload.title` | `CPU spike` |
| `{{server}}` | из `payload.server` | `prod-01` |
| `{{severity}}` | из `payload.severity` | `critical` |
| `{{webhook_event_type}}` | значение `event_type` из тела | `alert` |
| `{{project_id}}` | id проекта автоматизации | `1` |

> **Важно:** поля берутся из объекта `payload` (не из корня запроса). `{{event_type}}` не сработает — используй `{{webhook_event_type}}`.

Пример action — `send_notification`:
```
Новый алерт: {{severity}} на {{server}} — {{title}}
```

Пример action — `create_task`:
- Title: `[{{severity}}] {{title}}`
- Description: `Сервер: {{server}}`

---

#### `review_received`

Payload, доступный в шаблонах:

| Переменная | Описание |
|------------|----------|
| `{{review.rating}}` | Оценка (1–5) |
| `{{review.author}}` | Имя автора |
| `{{review.text}}` | Текст отзыва |
| `{{review.business}}` | Название объекта |
| `{{review.date}}` | Дата |

Пример condition — `numeric_compare`:
- Field: `review.rating` / Op: `lte` / Value: `2`

Пример action — `create_task`:
- Title: `Жалоба {{review.rating}}★ от {{review.author}}`
- Description: `{{review.text}}`
- Urgency: `URGENT`

---

#### `github_event`

GitHub присылает PR/Issue/Push. После нормализации доступно:

**PR-события** (`github_pr_merged`, `github_pr_opened`, `github_pr_closed`):

| Переменная | Описание |
|------------|----------|
| `{{pr.number}}` | Номер PR |
| `{{pr.title}}` | Название |
| `{{pr.author}}` | Автор (GitHub login) |
| `{{pr.merged_by}}` | Кто смержил |
| `{{pr.base_branch}}` | Целевая ветка |
| `{{pr.head_branch}}` | Ветка PR |
| `{{pr.url}}` | Ссылка на PR |
| `{{repo.full_name}}` | `org/repo` |
| `{{sender.login}}` | Кто инициировал событие |

**Issue-события** (`github_issue_opened`, `github_issue_closed`):

| Переменная | Описание |
|------------|----------|
| `{{issue.number}}` | Номер issue |
| `{{issue.title}}` | Заголовок |
| `{{issue.body}}` | Описание |
| `{{issue.author}}` | Автор |
| `{{issue.html_url}}` | Ссылка |

**Push** (`github_push`):

| Переменная | Описание |
|------------|----------|
| `{{ref}}` | Ветка (`refs/heads/main`) |
| `{{pusher}}` | Кто запушил |
| `{{repo.full_name}}` | Репозиторий |

---

#### Внутренние триггеры (`task_created`, `task_updated`, `column_changed`)

| Переменная | Описание |
|------------|----------|
| `{{id}}` | ID задачи |
| `{{title}}` | Название задачи |
| `{{urgency}}` | Приоритет: `LOW / MEDIUM / HIGH / URGENT` |
| `{{column_id}}` | ID текущей колонки |
| `{{new_column_id}}` | Новая колонка (только `column_changed`) |

---

### Примеры curl

#### Generic webhook — отправить произвольное событие

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "alert",
    "external_event_id": "evt-001",
    "payload": {
      "title": "CPU spike",
      "server": "prod-01",
      "severity": "critical"
    }
  }'
```

- `event_type` — произвольная строка (используй как `{{webhook_event_type}}` в шаблонах)
- `external_event_id` — уникальный ID для dedupe; если не указан, берётся SHA256 тела
- `payload` — любой JSON-объект, его поля доступны напрямую как `{{field}}`
- `is_duplicate_prohibited` — `true` чтобы **обойти** дедупликацию и обработать запрос повторно

Повторный запрос с тем же `external_event_id` → `200 {"status":"duplicate"}` (идемпотентно).

Чтобы форс-повторить уже доставленный запрос (без смены `external_event_id`):
```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "huy",
    "is_duplicate_prohibited": true,
    "payload": {
      "event": "huuii naaaaddaa"
    }
  }'
```
→ `202 {"status":"accepted","dedup":false}` — обработан без записи в webhook_deliveries.

---

#### GitHub webhook — симуляция PR merged

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: unique-delivery-id-001" \
  -d '{
    "action": "closed",
    "pull_request": {
      "number": 42,
      "title": "Fix auth bug",
      "merged": true,
      "html_url": "https://github.com/org/repo/pull/42",
      "user": {"login": "alice"},
      "merged_by": {"login": "bob"},
      "base": {"ref": "main"},
      "head": {"ref": "feature/fix-auth"}
    },
    "repository": {"full_name": "org/repo"}
  }'
```

Другие события GitHub:

```bash
# Issue opened
-H "X-GitHub-Event: issues"
-d '{"action":"opened","issue":{"number":99,"title":"Bug","body":"...","user":{"login":"alice"}},"repository":{"full_name":"org/repo"}}'

# Push
-H "X-GitHub-Event: push"
-d '{"ref":"refs/heads/main","pusher":{"name":"alice"},"commits":[{"message":"fix: ..."}],"repository":{"full_name":"org/repo"}}'
```

---

#### Запустить review-scraper вручную

```bash
# Получить JWT
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"d.morozov@victorygroup.ru"}' | jq -r .access_token)

# Запустить scraper
curl -X POST http://localhost:8000/api/v1/automations/run-review-scraper \
  -H "Authorization: Bearer $TOKEN"
# → {"automations_processed":1,"reviews_seen":5,"events_published":2}

# Сгенерировать новый отзыв на review-board
curl -X POST http://localhost:8002/api/reviews/generate
```

---

### Как получить Webhook URL

1. Войди в раздел **Automations** → вкладка **Custom Triggers**
2. Скопируй URL кнопкой **Copy URL**
3. Или создай автоматизацию через API и возьми `webhook_token` из ответа:

```bash
curl -X POST http://localhost:8000/api/v1/automations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "name": "My webhook automation",
    "config": {
      "trigger": {"type": "webhook_generic"},
      "conditions": [],
      "actions": [{
        "type": "send_notification",
        "params": {
          "message": "Новый алерт: {{severity}} — {{title}}",
          "user_id": 1
        }
      }]
    }
  }'
# ответ: { ..., "webhook_token": "abc123...", ... }
# Webhook URL: http://localhost:8000/api/v1/webhooks/abc123...
```

Сменить токен: `POST /api/v1/automations/{id}/rotate-token`

---

## Демо-сценарий (3-5 минут)

### 1. Вход
Откройте `http://localhost:3000` и войдите как **Дмитрий Морозов** (Owner).

### 2. Канбан-доска
На доске видны задачи в колонках. Задачи можно перетаскивать (drag-and-drop).

### 3. Flow A — Негативный отзыв → задача

```bash
# Сгенерировать негативный отзыв
curl -X POST http://localhost:8002/api/reviews/generate

# Запустить scraper вручную
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"d.morozov@victorygroup.ru"}' | jq -r .access_token)

curl -X POST http://localhost:8000/api/v1/automations/run-review-scraper \
  -H "Authorization: Bearer $TOKEN"
```

Обновите доску — в TODO появится новая задача из негативного отзыва.

### 4. Flow B — GitHub webhook → уведомление

```bash
# 1. Создай automation с trigger github_event в UI → скопируй webhook_token
# 2. Симулируй GitHub PR merged:
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: demo-$(date +%s)" \
  -d '{"action":"closed","pull_request":{"number":1,"title":"Deploy fix","merged":true,"user":{"login":"alice"},"merged_by":{"login":"bob"},"base":{"ref":"main"},"head":{"ref":"hotfix"}},"repository":{"full_name":"org/repo"}}'
```

В колокольчике появится уведомление.

### 5. Flow C — Generic webhook → создание задачи

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "incident",
    "external_event_id": "inc-001",
    "payload": {
      "title": "PostgreSQL replication lag",
      "server": "db-primary",
      "severity": "critical"
    }
  }'
```

На доске появится задача `[critical] PostgreSQL replication lag`.

### 6. RBAC — жизненный цикл задачи
1. Перетащите задачу TODO → IN_PROGRESS → REVIEW
2. Войдите как **Анна Козлова** (Assignee) — она **не** может перевести в DONE
3. Вернитесь как Owner → переведите REVIEW → DONE

---

## Демо-пользователи

| Email | Роль | Проект |
|-------|------|--------|
| `d.morozov@victorygroup.ru` | OWNER | onegin-park, zhk-bereg |
| `a.kozlova@victorygroup.ru` | ASSIGNEE | onegin-park |
| `i.petrov@victorygroup.ru` | ASSIGNEE | zhk-bereg |

Логин без пароля: `POST /api/v1/auth/token {"email": "..."}` — `CORE_DEV_LOGIN=true`.

---

## Команды

```bash
# Управление стеком
docker compose up -d --build        # запустить
docker compose down                  # остановить
docker compose logs -f core-api     # логи сервиса
docker compose logs -f automation-worker  # логи воркера автоматизаций

# Миграции
cd services/core-api
alembic upgrade head
alembic revision --autogenerate -m "описание"
```

## Разработка (без Docker)

```bash
# Backend
cd services/core-api
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd apps/web
npm install
npm run dev
```

## Тесты

```bash
# Backend (каждый сервис в своём venv)
cd services/core-api && .venv/bin/python -m pytest tests/ -v      # ~34 теста
cd services/ml-worker && .venv/bin/python -m pytest tests/ -v     # ~11 тестов
cd jobs/review-scraper && .venv/bin/python -m pytest tests/ -v    # ~22 теста

# Frontend
cd apps/web && npx vitest run                                      # ~26 тестов

# E2E (живые сервисы должны быть запущены)
python3 -m pytest tests/e2e -q
```

## CI/CD

GitHub Actions (`.github/workflows/main.yml`):
- **backend-quality** — Ruff + Pytest для всех Python-сервисов (матрица)
- **frontend-quality** — TypeScript + Vitest + Vite build
- **integration-smoke** — Docker Compose + smoke-тесты

## Стек

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, aio_pika
- **Frontend:** React 18, TypeScript, Vite, dnd-kit, TanStack Query, Zustand
- **AI:** Anthropic Claude API (mock mode для демо)
- **Infra:** Docker Compose, GitHub Actions, nginx
