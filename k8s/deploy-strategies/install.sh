#!/usr/bin/env bash
# Homework #8: deployment strategies for core-api behind Envoy Gateway (Gateway API).
#   ./k8s/deploy-strategies/install.sh
#   ./k8s/deploy-strategies/demo.sh rolling | blue-green | canary | ab | shadow
#
# 1. Envoy Gateway with the Gateway API CRDs (same release as in the seminar demo).
# 2. Two releases of core-api in minikube's Docker: task-scheduler/core-api:v1.0.0 and :v2.0.0,
#    built from the same code with APP_VERSION baked in (answer, header X-App-Version, metric).
# 3. GatewayClass + Gateway `eg` in task-scheduler, routes: / → web, /api and /ws → core-api.
set -euo pipefail

cd "$(dirname "$0")"
CTX="${KUBE_CONTEXT:-minikube}"
ENVOY_GATEWAY_VERSION="${ENVOY_GATEWAY_VERSION:-v1.10.0}"

kubectl --context "$CTX" apply --server-side -f \
  "https://github.com/envoyproxy/gateway/releases/download/${ENVOY_GATEWAY_VERSION}/install.yaml"
kubectl --context "$CTX" -n envoy-gateway-system wait deployment/envoy-gateway \
  --for=condition=Available --timeout=5m

eval "$(minikube docker-env)"
for v in v1.0.0 v2.0.0; do
  docker build --build-arg APP_VERSION="$v" -t "task-scheduler/core-api:$v" ../../services/core-api
done

kubectl --context "$CTX" apply -f 00-gateway.yaml -f 01-backend-traffic-policy.yaml -f strategies/rolling/httproute.yaml
kubectl --context "$CTX" -n task-scheduler wait gateway/eg --for=condition=Accepted --timeout=3m
kubectl --context "$CTX" -n envoy-gateway-system wait pod \
  -l gateway.envoyproxy.io/owning-gateway-name=eg --for=condition=Ready --timeout=3m
echo "Gateway is up. Traffic: ./traffic.sh   Strategies: ./demo.sh <strategy>"
