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
- **PostgreSQL 16**: Основное хранилище данных.
- **RabbitMQ 3**: Очередь событий для асинхронных автоматизаций.
- **WebSocket**: Реал-тайм обновления доски и «колокольчика» уведомлений.
- **Docker Compose**: Контейнеризация и оркестрация всех сервисов.

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
cp .env.example .env
```

### 2. Запуск в Docker (рекомендуется)
```bash
docker compose up -d --build
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Swagger UI (Core API)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **RabbitMQ Management**: [http://localhost:15672](http://localhost:15672) (guest/guest)

### 3. Демо-пользователи
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

**Backend:**
```bash
cd services/core-api
python -m venv .venv
source .venv/bin/activate  # или .venv\Scripts\activate на Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd apps/web
npm install
npm run dev
```

### Тестирование
```bash
# Unit & Integration тесты
cd services/core-api && pytest

# E2E тесты (требуют запущенный Docker Compose)
pytest tests/e2e -v
```

---

## 📜 Лицензия
Victory Group — Внутренняя разработка для повышения эффективности digital-команд.
