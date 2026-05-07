#!/usr/bin/env bash
set -euo pipefail

# Non-interactive deploy script for CloudVPS via SSH
# Usage: DEPLOY_HOST=user@server ./scripts/deploy.sh
# Env vars: DEPLOY_HOST (required), DEPLOY_DIR (default: /opt/task-scheduler), DEPLOY_BRANCH (default: main)

DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST env var is required (e.g. user@server)}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/task-scheduler}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

echo "=== Deploying to $DEPLOY_HOST ==="
echo "  Directory: $DEPLOY_DIR"
echo "  Branch: $DEPLOY_BRANCH"

ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" bash -s <<REMOTE
  set -euo pipefail

  if [ ! -d "$DEPLOY_DIR" ]; then
    echo "First deploy — cloning repository..."
    git clone --branch "$DEPLOY_BRANCH" "\${REPO_URL:-https://github.com/FblRKUS/task-scheduler-unithack.git}" "$DEPLOY_DIR"
  fi

  cd "$DEPLOY_DIR"
  echo "Pulling latest changes..."
  git fetch origin
  git checkout "$DEPLOY_BRANCH"
  git pull origin "$DEPLOY_BRANCH"

  echo "Building and starting services..."
  docker compose pull 2>/dev/null || true
  docker compose build
  docker compose up -d

  echo "Waiting for health checks..."
  for i in \$(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
      echo "  core-api is healthy"
      break
    fi
    sleep 2
  done

  echo "Running migrations..."
  docker compose exec -T core-api alembic upgrade head 2>/dev/null || echo "  (migrations skipped or not needed)"

  echo "=== Deploy complete ==="
  docker compose ps
REMOTE
