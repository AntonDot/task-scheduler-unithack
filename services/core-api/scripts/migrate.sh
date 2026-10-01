#!/bin/sh
# One-off admin process (12-factor XII): run by the `migrate` service before core-api
# starts, from the same image and with the same config as the app. Exits when done.
set -eu

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

echo "Preparing object storage..."
python -m scripts.ensure_bucket

if [ "${CORE_SEED_DEMO:-false}" = "true" ]; then
  echo "Seeding demo data..."
  python -m scripts.seed
fi

echo "Admin tasks complete."
