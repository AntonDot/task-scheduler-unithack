#!/usr/bin/env bash
# Builds the app images for minikube.
#
#   ./k8s/build-images.sh          — build straight in minikube's Docker daemon
#                                    (eval $(minikube docker-env)), nothing to load
#   ./k8s/build-images.sh --load   — build in the local Docker and copy every image
#                                    into the cluster with `minikube image load`
#
# Tag `dev` (not `latest`) + imagePullPolicy IfNotPresent in the manifests: the kubelet
# uses the local image and never tries to pull it from Docker Hub.
set -euo pipefail

cd "$(dirname "$0")/.."
TAG="${APP_VERSION:-dev}"
MODE="${1:-}"

if [ "$MODE" != "--load" ]; then
  eval "$(minikube docker-env)"
fi

# name:build-context (plain list — macOS ships bash 3.2 without associative arrays)
IMAGES="core-api:services/core-api
automation-worker:services/automation-worker
ml-worker:services/ml-worker
mock-review-board:services/mock-review-board
review-scraper:jobs/review-scraper
web:apps/web"

for entry in $IMAGES; do
  name="${entry%%:*}"
  context="${entry#*:}"
  image="task-scheduler/${name}:${TAG}"
  echo "=== building ${image}"
  docker build --build-arg APP_VERSION="$TAG" -t "$image" "$context"
  if [ "$MODE" = "--load" ]; then
    minikube image load "$image"
  fi
done

echo "=== images in minikube"
minikube image ls | grep task-scheduler/
