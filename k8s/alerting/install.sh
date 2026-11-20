#!/usr/bin/env bash
# Homework #6: Alertmanager with Telegram notifications + alert rules, on top of homework #5.
# Needs the Secret from telegram-secret.sh.
#   ./k8s/alerting/install.sh
set -euo pipefail

cd "$(dirname "$0")"
CTX="${KUBE_CONTEXT:-minikube}"
K="kubectl --context $CTX -n monitoring"
HELM="${HELM:-helm}"

chat_id="$($K get secret alertmanager-telegram -o jsonpath='{.data.chat-id}' | base64 -d)" || {
  echo "No Secret alertmanager-telegram: run ./k8s/alerting/telegram-secret.sh first" >&2
  exit 1
}

# Rules and Alertmanager config as ConfigMaps (apply = create or update)
$K create configmap vmalert-alerting-rules --from-file=alerts.yaml \
  --dry-run=client -o yaml | $K apply -f -
sed "s/__TELEGRAM_CHAT_ID__/$chat_id/" alertmanager.yaml > "${TMPDIR:-/tmp}/alertmanager.yaml"
$K create configmap alertmanager-config \
  --from-file=alertmanager.yaml="${TMPDIR:-/tmp}/alertmanager.yaml" --from-file=telegram.tmpl \
  --dry-run=client -o yaml | $K apply -f -
rm -f "${TMPDIR:-/tmp}/alertmanager.yaml"

$HELM upgrade --install vmalert oci://ghcr.io/victoriametrics/helm-charts/victoria-metrics-alert \
  --version 0.50.0 --kube-context "$CTX" -n monitoring \
  -f ../slo/vmalert-values.yaml -f vmalert-alerting-values.yaml --wait

# Alertmanager reads its config at start: pick up a changed ConfigMap
$K rollout restart deployment/vmalert-victoria-metrics-alert-alertmanager
$K rollout status deployment/vmalert-victoria-metrics-alert-alertmanager --timeout=120s
