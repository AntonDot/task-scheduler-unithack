# Victory Group — Task Scheduler

Минималистичный таск-менеджер со встроенным AI-ассистентом для digital-агентства Victory Group.

## Архитектура

| Сервис | Порт | Описание |
|--------|------|----------|
| `core-api` | 8000 | FastAPI — CRUD задач, RBAC, WebSockets |
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

## Демо-сценарий (3-5 минут)

### 1. Вход
Откройте `http://localhost:3000` и войдите как **Дмитрий Морозов** (Owner).

### 2. Канбан-доска
На доске видны задачи в колонках: AI Drafts, TODO, In Progress, Review, Done.
Задачи можно перетаскивать между колонками (drag-and-drop).

### 3. Flow A — Автопилот инцидентов
```bash
# Сгенерировать негативный отзыв
curl -X POST http://localhost:8002/api/reviews/generate

# Скрейпер уже работает в фоне через docker compose.
# Для ручного форс-прогона:
docker compose run --rm review-scraper python scraper.py --once
```
Обновите доску — в TODO появится новая задача из негативного отзыва.

### 4. Flow B — AI Draft
```bash
curl -X POST http://localhost:8001/webhook/draft-text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-webhook-key" \
  -d '{"source":"manager_ui","text":"Нужны новые баннеры для VK-кампании клиента Берег","project_slug":"zhk-bereg"}'
```
В колонке AI Drafts появится черновик. Нажмите **Approve Draft** (доступно только Owner).

### 5. RBAC — жизненный цикл задачи
1. Перетащите задачу TODO → IN_PROGRESS → REVIEW
2. Войдите как **Анна Козлова** (Assignee) — она **не** может перевести в DONE
3. Вернитесь как Owner → переведите REVIEW → DONE

### 6. Мобильный режим
Откройте DevTools → мобильный вид (< 768px). Интерфейс переключится на MobileListView с крупными кнопками.

## Команды

```bash
# Управление стеком
docker compose up -d --build        # запустить
docker compose down                  # остановить
docker compose logs -f core-api     # логи сервиса

# Скрейпер
docker compose up -d review-scraper  # непрерывный режим
docker compose run --rm review-scraper python scraper.py --once  # однократно
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
cd services/core-api && .venv/bin/python -m pytest tests/ -v      # 28 тестов
cd services/ml-worker && .venv/bin/python -m pytest tests/ -v     # 11 тестов
cd services/mock-review-board && .venv/bin/python -m pytest tests/ -v  # 8 тестов
cd jobs/review-scraper && .venv/bin/python -m pytest tests/ -v    # 22 тестов

# Frontend
cd apps/web && npx vitest run                                      # 26 тестов

# E2E (живые сервисы должны быть запущены)
python3 -m pytest tests/e2e -q
```

## CI/CD

GitHub Actions (`.github/workflows/main.yml`):
- **backend-quality** — Ruff + Pytest для всех Python-сервисов (матрица)
- **frontend-quality** — TypeScript + Vitest + Vite build
- **integration-smoke** — Docker Compose + smoke-тесты

Деплой: `scripts/deploy.sh` (SSH + docker compose на CloudVPS).

## Стек

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic
- **Frontend:** React 18, TypeScript, Vite, dnd-kit, TanStack Query, Zustand
- **AI:** Anthropic Claude API (mock mode для демо)
- **Infra:** Docker Compose, GitHub Actions, nginx
