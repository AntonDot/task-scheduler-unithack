#!/usr/bin/env bash
# SLI/SLO/SLA on top of the monitoring from k8s/monitoring/ (vm-single + vmagent):
#   - vmui-dashboards ConfigMap with the SLO dashboard, vm-single upgraded to show it;
#   - vmalert (victoria-metrics-alert 0.50.0, VictoriaMetrics v1.153.0 like the rest)
#     with recording rules for SLIs, SLO compliance, error budgets and burn-rate alerts.
# The prober itself is part of the app: k8s/44-prober.yaml.
set -euo pipefail

cd "$(dirname "$0")"
CHARTS=oci://ghcr.io/victoriametrics/helm-charts
KUBE_CONTEXT="${KUBE_CONTEXT:-minikube}"

kubectl --context "$KUBE_CONTEXT" -n monitoring create configmap vmui-dashboards \
  --from-file=dashboards/ --dry-run=client -o yaml | kubectl --context "$KUBE_CONTEXT" apply -f -

helm upgrade --install vm-single "$CHARTS/victoria-metrics-single" --version 0.48.0 \
  --kube-context "$KUBE_CONTEXT" --namespace monitoring \
  -f ../monitoring/vm-single-values.yaml -f vm-single-dashboards-values.yaml --wait

helm upgrade --install vmalert "$CHARTS/victoria-metrics-alert" --version 0.50.0 \
  --kube-context "$KUBE_CONTEXT" --namespace monitoring \
  -f vmalert-values.yaml --wait

kubectl --context "$KUBE_CONTEXT" -n monitoring get pods
