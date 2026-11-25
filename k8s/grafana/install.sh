#!/usr/bin/env bash
# Homework #7: Grafana on top of VictoriaMetrics (homework #4) and the SLO rules (homework #5).
#   ./k8s/grafana/install.sh
#   kubectl -n monitoring port-forward svc/grafana 3000:80   → http://localhost:3000
#
# 1. Imports the "PostgreSQL Database" dashboard for postgres_exporter from grafana.com (9628)
#    and fits its variables to the labels vmagent puts on our series (see below).
# 2. ConfigMap `grafana-dashboards` with it and the app dashboard (dashboards/task-scheduler.json).
# 3. Grafana from the grafana-community chart with the VictoriaMetrics data source.
set -euo pipefail

cd "$(dirname "$0")"
CTX="${KUBE_CONTEXT:-minikube}"
K="kubectl --context $CTX -n monitoring"
CHART_VERSION=14.6.0        # Grafana 13.3.2
PG_DASHBOARD_ID=9628
PG_DASHBOARD_REVISION=8
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The dashboard was made for the old Prometheus Helm chart: it picks the exporter by the labels
# kubernetes_namespace and release. vmagent labels our pods namespace and app (relabel_configs
# in k8s/monitoring/vm-agent-values.yaml), so the variables would stay empty. Same panels,
# variables and filters rewritten to namespace / app:
#   namespace = label_values(pg_up, namespace), release = app of the exporter pod, instance = its address.
curl -sSfL "https://grafana.com/api/dashboards/$PG_DASHBOARD_ID/revisions/$PG_DASHBOARD_REVISION/download" \
  -o "$TMP/postgresql-raw.json"
jq '
  del(.__inputs, .__requires, .id)
  | .uid = "postgresql-9628"
  | .title = "PostgreSQL Database (grafana.com 9628)"
  | walk(if type == "string" then gsub("release=\"\\$release\""; "app=\"$release\"") else . end)
  | .templating.list |= map(
      if .name == "namespace" then
        .query = "label_values(pg_up, namespace)" | .regex = ""
        | .current = {text: "task-scheduler", value: "task-scheduler"}
      elif .name == "release" then
        .label = "app" | .query = "label_values(pg_up{namespace=\"$namespace\"}, app)" | .regex = ""
      elif .name == "instance" then
        .query = "label_values(pg_up{namespace=\"$namespace\", app=\"$release\"}, instance)" | .regex = ""
      elif .name == "datname" then
        .query = "label_values(pg_stat_database_tup_fetched{instance=~\"$instance\"}, datname)"
      else . end
      | if .definition != null then .definition = .query else . end)
' "$TMP/postgresql-raw.json" > "$TMP/postgresql.json"

$K create configmap grafana-dashboards \
  --from-file=task-scheduler.json=dashboards/task-scheduler.json \
  --from-file=postgresql.json="$TMP/postgresql.json" \
  --dry-run=client -o yaml | $K apply -f -

helm repo add grafana-community https://grafana-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update grafana-community >/dev/null
helm upgrade --install grafana grafana-community/grafana --version "$CHART_VERSION" \
  --kube-context "$CTX" -n monitoring -f grafana-values.yaml --wait

echo "Grafana: kubectl -n monitoring port-forward svc/grafana 3000:80 → http://localhost:3000"
echo "login admin, password: kubectl -n monitoring get secret grafana -o jsonpath='{.data.admin-password}' | base64 -d"
