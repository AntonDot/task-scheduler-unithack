#!/usr/bin/env bash
# Steady traffic through the Envoy proxy of the Gateway to GET /api/v1/version; prints which
# release and pod answered, so the effect of a strategy is visible request by request:
#   15:04:11 | v1.0.0 | core-api-v1-6d4f7c9b8-x2k4p
#
#   ./traffic.sh              # until Ctrl-C
#   ./traffic.sh 100          # 100 requests and exit
#   RATE=0.1 ./traffic.sh     # pause between requests, s (default 0.2)
#   HEADER='x-user-group: beta' LABEL=beta ./traffic.sh   # extra header and a prefix for the line
#
# Reaching the proxy: its LoadBalancer Service stays Pending on minikube, so a port-forward to it
# on LOCAL_PORT (default 8888). Several copies share one port-forward: started only if the port
# does not answer yet.
set -euo pipefail

CTX="${KUBE_CONTEXT:-minikube}"
EG_NS=envoy-gateway-system
LOCAL_PORT="${LOCAL_PORT:-8888}"
RATE="${RATE:-0.2}"
COUNT="${1:-0}"
HEADER="${HEADER:-}"
LABEL="${LABEL:-}"
URL="http://localhost:${LOCAL_PORT}/api/v1/version"

if ! curl -s -o /dev/null --max-time 1 "http://localhost:${LOCAL_PORT}/"; then
  svc="$(kubectl --context "$CTX" -n "$EG_NS" get svc \
    -l gateway.envoyproxy.io/owning-gateway-name=eg,gateway.envoyproxy.io/owning-gateway-namespace=task-scheduler \
    -o jsonpath='{.items[0].metadata.name}')"
  [ -n "$svc" ] || { echo "no Envoy proxy for Gateway task-scheduler/eg: run ./install.sh" >&2; exit 1; }
  kubectl --context "$CTX" -n "$EG_NS" port-forward "svc/$svc" "${LOCAL_PORT}:80" >/dev/null 2>&1 &
  PF_PID=$!
  trap 'kill "$PF_PID" 2>/dev/null || true' EXIT INT TERM
  for _ in $(seq 1 30); do
    curl -s -o /dev/null --max-time 1 "http://localhost:${LOCAL_PORT}/" && break
    sleep 0.5
  done
fi

prefix="${LABEL:+$LABEL | }"
i=0
while :; do
  # body {"service":"core-api","version":"v1.0.0","pod":"core-api-v1-…"}; anything else — the HTTP code
  out="$(curl -s --max-time 3 ${HEADER:+-H "$HEADER"} -w '\n%{http_code}' "$URL" || true)"
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  if [ "$code" = 200 ]; then
    version="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' <<<"$body")"
    pod="$(sed -n 's/.*"pod":"\([^"]*\)".*/\1/p' <<<"$body")"
    line="$version | $pod"
  else
    line="HTTP ${code:-000}"
  fi
  printf '%s | %s%s\n' "$(date +%H:%M:%S)" "$prefix" "$line"
  i=$((i + 1))
  [ "$COUNT" -gt 0 ] && [ "$i" -ge "$COUNT" ] && break
  sleep "$RATE"
done
