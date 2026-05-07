#!/bin/bash
set -euo pipefail

echo "Running database migrations..."
if ! alembic upgrade head; then
  echo "Migration failed. Checking for legacy schema..."
  if python -m scripts.db_compat; then
    echo "Legacy schema detected. Stamping Alembic head..."
    alembic stamp head
  else
    echo "Migration failed and no compatible schema found."
    exit 1
  fi
fi

echo "Seeding demo data..."
python -m scripts.seed

echo "Starting Core API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
