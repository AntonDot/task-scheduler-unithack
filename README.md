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
| `webhook_generic` | Произвольный внешн�### 🔧 Полное руководство: Использование внешних вебхуков (Webhooks FAQ)

Все автоматизации с внешними триггерами (`webhook_generic`, `github_event`, `review_received`) при создании автоматически генерируют уникальный публичный URL-адрес вида:
`http://localhost:8000/api/v1/webhooks/{webhook_token}`

Каждый входящий запрос к этому адресу проходит три этапа:
1. **Дедупликация (Deduplication)**: Бэкенд проверяет уникальность запроса по его идентификатору (`external_event_id`). Повторный запрос с тем же ID вернет `200 {"status":"duplicate"}` и не вызовет автоматизацию повторно.
2. **Нормализация (Normalization)**: Сырое тело JSON-запроса приводится к плоскому объекту payload.
3. **Обработка (Processing)**: Событие публикуется в RabbitMQ, и `automation-worker` проверяет правила и выполняет заданные действия (Actions).

---

### 1. Как устроен запрос `webhook_generic` (Универсальный вебхук)

Чтобы запустить автоматизацию с триггером `webhook_generic`, отправьте `POST`-запрос на полученный URL.

**Структура запроса:**
```json
{
  "event_type": "alert",
  "external_event_id": "evt-postman-999",
  "is_duplicate_prohibited": true,
  "payload": {
    "title": "CPU spike detected",
    "server": "prod-db-01",
    "severity": "critical",
    "details": {
      "load_average": 8.5
    }
  }
}
```

*   `event_type` (строка) — произвольный тип вашего события. Вы сможете использовать его для фильтрации в условиях автоматизации (доступно как `webhook_event_type`).
*   `external_event_id` (строка, опционально) — уникальный ID транзакции для предотвращения дублирования. Если не передать — бэкенд сгенерирует SHA256 хэш от тела запроса.
*   `is_duplicate_prohibited` (булево, опционально) — установите `true`, если хотите **обойти дедупликацию** (полезно при тестировании из Postman или curl, чтобы запросы выполнялись повторно без смены ID).
*   `payload` (JSON-объект) — любые данные, которые вы хотите передать в автоматизацию. **Все поля внутри `payload` поднимаются на верхний уровень нормализованного объекта.**

---

### 2. Как обращаться к полям в условиях (Conditions)

Когда `automation-worker` обрабатывает событие, он сопоставляет условия типа `field_value_equals` с полями вашего объекта `payload`.

Так как поля из объекта `payload` в запросе поднимаются на верхний уровень, к ним нужно обращаться **напрямую по имени ключа**.

| Вы хотите проверить | Какое поле указать в `field` (в UI или API) | Какое значение указать в `value` |
|--------------------|---------------------------------------------|----------------------------------|
| Тип события `event_type` | `webhook_event_type` | `alert` |
| Кастомный параметр `severity` | `severity` | `critical` |
| Имя сервера `server` | `server` | `prod-db-01` |
| Вложенное свойство | `details.load_average` | `8.5` |

**Пример конфигурации условия в JSON:**
```json
{
  "type": "field_value_equals",
  "params": {
    "field": "severity",
    "value": "critical"
  }
}
```

---

### 3. Как подставлять поля в шаблонах (Templates)

В действиях автоматизации (например, `send_notification` или `create_task`) в полях "Текст уведомления", "Заголовок задачи" и "Описание" вы можете использовать двойные фигурные скобки `{{переменная}}` для динамической подстановки данных из вебхука.

#### Доступные переменные для `webhook_generic`:

| Переменная | Описание | Пример вывода |
|------------|----------|---------------|
| `{{webhook_event_type}}` | Значение поля `event_type` из запроса | `alert` |
| `{{title}}` | Поле `title` из `payload` | `CPU spike detected` |
| `{{server}}` | Поле `server` из `payload` | `prod-db-01` |
| `{{severity}}` | Поле `severity` из `payload` | `critical` |
| `{{details.load_average}}` | Вложенные поля из `payload` | `8.5` |
| `{{project_id}}` | ID проекта, в котором создана автоматизация | `1` |

**Пример использования в экшене `send_notification`:**
```text
⚠️ Внимание! На сервере {{server}} произошел инцидент: {{title}} (Приоритет: {{severity}}).
```
*Результат:* `⚠️ Внимание! На сервере prod-db-01 произошел инцидент: CPU spike detected (Приоритет: critical).`

**Пример использования в экшене `create_task`:**
*   **Title:** `[{{severity}}] {{title}}` -> `[critical] CPU spike detected`
*   **Description:** `Сервер: {{server}}. Средняя нагрузка: {{details.load_average}}` -> `Сервер: prod-db-01. Средняя нагрузка: 8.5`

---

### 4. Примеры curl для быстрого тестирования

#### Тест A. Отправить произвольное событие (Generic Webhook)

Отправьте этот запрос, заменив `<TOKEN>` на токен вашей автоматизации:

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
*   Первый запрос вернет `202 {"status":"accepted", ...}`.
*   Повторный запрос с тем же `external_event_id` вернет `200 {"status":"duplicate"}` (защита от дублирования).

#### Тест B. Повторный запуск без смены ID (Игнорируя дедупликацию)

Передайте `"is_duplicate_prohibited": true` во время отладки, чтобы не менять `external_event_id` вручную при каждом вызове:

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<TOKEN> \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "alert",
    "is_duplicate_prohibited": true,
    "payload": {
      "title": "CPU spike (Retest)",
      "server": "prod-01",
      "severity": "critical"
    }
  }'
```
→ Вернет `202 {"status":"accepted", "dedup":false}`, событие выполнится повторно!
----|
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
