#!/usr/bin/env bash
# Installs VictoriaMetrics into minikube with the official Helm charts:
#   vm-single  — victoria-metrics-single (storage + query API on :8428)
#   vm-agent   — victoria-metrics-agent  (scraping by pod annotations, push endpoint on :8429)
# Chart versions are pinned; both ship VictoriaMetrics v1.153.0.
# Charts come from VictoriaMetrics' OCI registry on ghcr.io — the same charts as the
# https://victoriametrics.github.io/helm-charts repo from the docs, which is equivalent:
#   helm repo add vm https://victoriametrics.github.io/helm-charts/ && helm repo update
#   helm upgrade --install vm-single vm/victoria-metrics-single --version 0.48.0 ...
set -euo pipefail

cd "$(dirname "$0")"
CHARTS=oci://ghcr.io/victoriametrics/helm-charts
KUBE_CONTEXT="${KUBE_CONTEXT:-minikube}"

helm upgrade --install vm-single "$CHARTS/victoria-metrics-single" --version 0.48.0 \
  --kube-context "$KUBE_CONTEXT" --namespace monitoring --create-namespace \
  -f vm-single-values.yaml --wait

helm upgrade --install vm-agent "$CHARTS/victoria-metrics-agent" --version 0.49.0 \
  --kube-context "$KUBE_CONTEXT" --namespace monitoring \
  -f vm-agent-values.yaml --wait

kubectl --context "$KUBE_CONTEXT" -n monitoring get pods,svc
