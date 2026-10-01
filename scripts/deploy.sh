#!/usr/bin/env bash
set -euo pipefail

# Release + run stages of 12-factor V. Nothing is built on the server: it pulls the
# images that CI built for APP_VERSION and starts them with the server's own .env.
#
# Usage: DEPLOY_HOST=user@server APP_VERSION=<git sha | v-tag> ./scripts/deploy.sh
#        (sha is 7 chars, as tagged by CI: git rev-parse --short=7 HEAD)
# Rollback: the same command with the previous APP_VERSION — while the database schema
# is still compatible with it (Alembic migrations are not rolled back automatically).
#
# GHCR packages are private by default: run `docker login ghcr.io` once on the server
# (a token with read:packages) or make the packages public.
#
# Env vars:
#   DEPLOY_HOST   (required) ssh target
#   APP_VERSION   (required) image tag built by .github/workflows/release.yml
#   DEPLOY_DIR    (default: /opt/task-scheduler) holds docker-compose.yml and .env
#   REGISTRY      (default: ghcr.io/antondot/task-scheduler)
#   COMPOSE_PROFILES (default: full)

DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST env var is required (e.g. user@server)}"
APP_VERSION="${APP_VERSION:?APP_VERSION env var is required (image tag, e.g. git sha)}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/task-scheduler}"
REGISTRY="${REGISTRY:-ghcr.io/antondot/task-scheduler}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-full}"

echo "=== Deploying ${APP_VERSION} to ${DEPLOY_HOST}:${DEPLOY_DIR} ==="

# The compose file is part of the release; .env (config + secrets) already lives on the server
ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR'"
scp docker-compose.yml "$DEPLOY_HOST:$DEPLOY_DIR/docker-compose.yml"

ssh "$DEPLOY_HOST" bash -s <<REMOTE
  set -euo pipefail
  cd "$DEPLOY_DIR"
  test -f .env || { echo ".env is missing in $DEPLOY_DIR — create it from .env.example"; exit 1; }

  export APP_VERSION="$APP_VERSION" REGISTRY="$REGISTRY" COMPOSE_PROFILES="$COMPOSE_PROFILES"
  echo "Pulling images \$REGISTRY/*:\$APP_VERSION..."
  docker compose pull --quiet
  # compose only warns when a pull of a buildable image fails — check explicitly
  for image in \$(docker compose config --images | sort -u); do
    docker image inspect "\$image" >/dev/null 2>&1 || { echo "Image \$image is missing (docker login ghcr.io?)"; exit 1; }
  done

  # migrate (one-off admin process) runs first; core-api waits for it to exit 0
  echo "Starting release..."
  docker compose up -d --no-build --wait

  echo "=== Deploy of \$APP_VERSION complete ==="
  docker compose ps
REMOTE
