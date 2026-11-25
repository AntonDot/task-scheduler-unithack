#!/usr/bin/env bash
# Runs one deployment strategy step by step on core-api behind the Envoy Gateway:
# shows every command, keeps traffic going through the Gateway (traffic.sh), counts which
# versions answered after each step and writes the whole session to logs/<strategy>.log.
#
#   ./demo.sh rolling      # Deployment core-api: v1.0.0 → v2.0.0 pod by pod, then rollout undo
#   ./demo.sh blue-green   # all traffic v1 → v2 at once, then instant rollback to v1
#   ./demo.sh canary       # weights 90/10 → 50/50 → 0/100
#   ./demo.sh ab           # x-user-group: beta → v2, everybody else → v1
#   ./demo.sh shadow       # answers from v1, copies of GET requests mirrored to v2
#   ./demo.sh reset        # back to the start: no v1/v2 Deployments, route to core-api
#
#   PAUSE=30 ./demo.sh canary   # seconds of traffic per step (default 20)
#
# One strategy at a time: each run starts with reset.
set -euo pipefail

cd "$(dirname "$0")"
CTX="${KUBE_CONTEXT:-minikube}"
NS=task-scheduler
PAUSE="${PAUSE:-20}"
LOCAL_PORT="${LOCAL_PORT:-8888}"
GW="http://localhost:${LOCAL_PORT}"
STRATEGY="${1:?strategy: rolling | blue-green | canary | ab | shadow | reset}"
k() { kubectl --context "$CTX" -n "$NS" "$@"; }

step() { printf '\n\033[1;36m===== %s  [%s]\033[0m\n' "$*" "$(date +%H:%M:%S)"; }
run() {  # print the command (arguments with spaces or quotes in single quotes), then run it
  local a shown=""
  for a in "$@"; do
    case "$a" in *[[:space:]\"\'{}]*) shown+=" '$a'" ;; *) shown+=" $a" ;; esac
  done
  printf '\033[1;33m$%s\033[0m\n' "$shown"
  "$@"
}

reset() {
  step "Сброс: только основной Deployment core-api, маршрут /api → Service core-api"
  run k apply -f strategies/rolling/httproute.yaml
  run k delete deployment,service -l 'app in (core-api-v1,core-api-v2)' --ignore-not-found
  run k apply -f ../30-core-api.yaml
  run k rollout status deployment/core-api --timeout=180s
}

revisions() {  # ReplicaSets of the Deployment: revision, image, replicas — what rollout undo goes back to
  printf '\033[1;33m$ k get rs -l app=core-api  (ревизии Deployment core-api)\033[0m\n'
  printf '%-10s %-32s %s\n' REVISION IMAGE REPLICAS
  k get rs -l app=core-api --no-headers \
    -o custom-columns='REVISION:.metadata.annotations.deployment\.kubernetes\.io/revision,IMAGE:.spec.template.spec.containers[0].image,REPLICAS:.spec.replicas' |
    sort -n | tail -n 3 | awk '{ printf "%-10s %-32s %s\n", $1, $2, $3 }'
}

two_versions() {
  step "Подготовка: core-api v1.0.0 и v2.0.0 рядом, по 2 реплики, общие PostgreSQL / S3 / RabbitMQ"
  run k apply -f app/core-api-v1.yaml -f app/core-api-v2.yaml
  run k rollout status deployment/core-api-v1 --timeout=180s
  run k rollout status deployment/core-api-v2 --timeout=180s
  k get pods -l 'app in (core-api-v1,core-api-v2)' -L version
}

# ── traffic ──────────────────────────────────────────────────────────────────────────────
RAW="$(mktemp)"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  rm -f "$RAW"
}
trap cleanup EXIT INT TERM

port_forward() {
  curl -s -o /dev/null --max-time 1 "$GW/" && return
  local svc
  svc="$(kubectl --context "$CTX" -n envoy-gateway-system get svc \
    -l gateway.envoyproxy.io/owning-gateway-name=eg,gateway.envoyproxy.io/owning-gateway-namespace=$NS \
    -o jsonpath='{.items[0].metadata.name}')"
  kubectl --context "$CTX" -n envoy-gateway-system port-forward "svc/$svc" "${LOCAL_PORT}:80" >/dev/null 2>&1 &
  PIDS+=($!)
  for _ in $(seq 1 30); do curl -s -o /dev/null --max-time 1 "$GW/" && return; sleep 0.5; done
  echo "Envoy proxy does not answer on $GW" >&2
  exit 1
}

traffic() {  # traffic [LABEL [HEADER]] — background, lines go to the screen and to $RAW
  LABEL="${1:-}" HEADER="${2:-}" LOCAL_PORT="$LOCAL_PORT" ./traffic.sh | tee -a "$RAW" &
  PIDS+=($!)
}

MARK=0
mark() { MARK="$(wc -l <"$RAW" | tr -d ' ')"; }
summary() {  # versions that answered since the last mark, by label if there are several streams
  sleep "$PAUSE"
  printf '\033[1;32m----- ответы за шаг (%s с): \033[0m\n' "$PAUSE"
  # line: "time | version | pod" or, with a label, "time | label | version | pod"
  tail -n +"$((MARK + 1))" "$RAW" | awk -F' [|] ' '
    { if (NF >= 4) { g = $2; v = $3 } else { g = ""; v = $2 }; n[g SUBSEP v]++; t[g]++ }
    END { for (k in n) { split(k, a, SUBSEP)
            printf "  %s%-10s %4d запросов  %5.1f %%\n", (a[1] != "" ? a[1] "→ " : ""), a[2], n[k], 100 * n[k] / t[a[1]] } }' | sort
  # what answers now, after the change settled
  printf '  последние 20: %s\n' "$(tail -n 20 "$RAW" | awk -F' [|] ' '{ v = (NF >= 4) ? $2 "→ " $3 : $2; n[v]++ }
    END { for (v in n) printf "%s ×%d  ", v, n[v] }')"
  mark
}

# ── strategies ───────────────────────────────────────────────────────────────────────────
rolling() {
  step "Подготовка: Deployment core-api на v1.0.0, 4 реплики (maxSurge 1, maxUnavailable 0)"
  run k set image deployment/core-api core-api=task-scheduler/core-api:v1.0.0 wait-for-migrations=task-scheduler/core-api:v1.0.0
  run k scale deployment/core-api --replicas=4
  run k rollout status deployment/core-api --timeout=180s
  port_forward; traffic; mark
  step "Трафик идёт на v1.0.0"
  summary

  step "Rolling update: новый образ v2.0.0 — Kubernetes меняет поды по одному"
  run k set image deployment/core-api core-api=task-scheduler/core-api:v2.0.0 wait-for-migrations=task-scheduler/core-api:v2.0.0
  run k rollout status deployment/core-api --timeout=300s
  k get pods -l app=core-api -o custom-columns=POD:.metadata.name,IMAGE:.spec.containers[0].image,READY:.status.containerStatuses[0].ready
  summary
  revisions

  step "Откат: rollout undo — тем же постепенным способом обратно на v1.0.0"
  run k rollout undo deployment/core-api
  run k rollout status deployment/core-api --timeout=300s
  revisions
  summary
}

blue_green() {
  two_versions
  run k apply -f strategies/blue-green/httproute-green.yaml
  port_forward; traffic; mark
  step "Весь трафик на green (v1.0.0), blue (v2.0.0) поднят и прогрет, но без трафика"
  summary
  step "Переключение на blue: одна правка HTTPRoute"
  run k apply -f strategies/blue-green/httproute-blue.yaml
  summary
  step "Мгновенный откат на green: green всё это время работал"
  run k apply -f strategies/blue-green/httproute-green.yaml
  summary
}

canary() {
  two_versions
  run k apply -f strategies/canary/httproute-90-10.yaml
  port_forward; traffic; mark
  step "Canary 90/10: 10 % запросов на v2.0.0"
  summary
  step "Canary 50/50"
  run k apply -f strategies/canary/httproute-50-50.yaml
  summary
  step "Canary 0/100: весь трафик на v2.0.0"
  run k apply -f strategies/canary/httproute-0-100.yaml
  summary
}

ab() {
  two_versions
  run k apply -f strategies/ab/httproute-ab.yaml
  port_forward
  traffic "все    "
  traffic "beta   " "x-user-group: beta"
  mark
  step "A/B: два потока — обычные пользователи и группа beta (заголовок x-user-group: beta)"
  summary
  step "Проверка вручную"
  run curl -s "$GW/api/v1/version"; echo
  run curl -s -H 'x-user-group: beta' "$GW/api/v1/version"; echo
  run curl -s -H 'x-user-group: alpha' "$GW/api/v1/version"; echo
}

shadow() {
  two_versions
  run k apply -f strategies/shadow/httproute-shadow.yaml
  port_forward; traffic; mark
  local since; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  step "Shadow: пользователю отвечает только v1.0.0, копии GET уходят на v2.0.0"
  summary
  step "Доказательство по access-логам: сколько раз каждая версия обработала GET /api/v1/version"
  for v in v1 v2; do
    printf '  core-api-%s: %s\n' "$v" \
      "$(k logs -l app=core-api-$v -c core-api --since-time="$since" --tail=-1 | grep -c '"url.path": "/api/v1/version"' || true)"
  done
  step "Запись не зеркалируется: POST /api/v1/auth/token попадает только в v1"
  local since_post; since_post="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
    -d '{"email":"d.morozov@victorygroup.ru"}' "$GW/api/v1/auth/token"
  sleep 2
  for v in v1 v2; do
    printf '  core-api-%s: POST /api/v1/auth/token — %s\n' "$v" \
      "$(k logs -l app=core-api-$v -c core-api --since-time="$since_post" --tail=-1 | grep -c '"url.path": "/api/v1/auth/token"' || true)"
  done
}

# ── main ─────────────────────────────────────────────────────────────────────────────────
mkdir -p logs
if [ "$STRATEGY" = reset ]; then reset; exit 0; fi
case "$STRATEGY" in rolling | blue-green | canary | ab | shadow) ;; *) echo "unknown strategy $STRATEGY" >&2; exit 1 ;; esac

# Everything on the screen also goes to logs/<strategy>.log, without colour codes
exec > >(tee >(sed -E $'s/\x1b\\[[0-9;]*m//g' >"logs/$STRATEGY.log")) 2>&1
step "Стратегия: $STRATEGY  ($(date '+%d.%m.%Y'), kubectl context $CTX)"
reset
case "$STRATEGY" in
  rolling) rolling ;;
  blue-green) blue_green ;;
  canary) canary ;;
  ab) ab ;;
  shadow) shadow ;;
esac
step "Готово. Лог: k8s/deploy-strategies/logs/$STRATEGY.log"
