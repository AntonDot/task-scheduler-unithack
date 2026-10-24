#!/usr/bin/env bash
# Puts realistic traffic through the app so there is something to query in VictoriaLogs:
#   1. normal work: logins, board reads, task creation, column moves, comments (INFO, 2xx)
#   2. client mistakes: unknown e-mail, bad token, missing task (WARNING, 4xx)
#   3. an incident: ml-worker scaled to 0 for ~2 minutes — review-scraper runs fail
#      and log ERROR, then ml-worker comes back
#
# Usage: ./k8s/logging/demo-load.sh            (needs the app deployed in minikube)
#        SKIP_INCIDENT=1 ./k8s/logging/demo-load.sh
set -euo pipefail

K="kubectl --context minikube -n task-scheduler"
PORT=3080
$K port-forward svc/web "$PORT:80" >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null || true' EXIT
sleep 3
API="http://localhost:$PORT/api/v1"

token() {
  curl -sf "$API/auth/token" -H 'content-type: application/json' -d "{\"email\":\"$1\"}" |
    python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
}

echo "== normal traffic"
OWNER=$(token d.morozov@victorygroup.ru)
ASSIGNEE=$(token a.kozlova@victorygroup.ru)
for round in $(seq 1 15); do
  for t in "$OWNER" "$ASSIGNEE"; do
    curl -s -o /dev/null -H "Authorization: Bearer $t" "$API/projects"
    curl -s -o /dev/null -H "Authorization: Bearer $t" "$API/projects/1/tasks"
    curl -s -o /dev/null -H "Authorization: Bearer $t" "$API/projects/1/columns"
    curl -s -o /dev/null -H "Authorization: Bearer $t" "$API/notifications"
  done
  task_id=$(curl -s -H "Authorization: Bearer $OWNER" -H 'content-type: application/json' \
    -d "{\"title\":\"Нагрузка: задача $round\"}" "$API/projects/1/tasks" |
    python3 -c 'import sys, json; print(json.load(sys.stdin)["id"])')
  column=$(curl -s -H "Authorization: Bearer $OWNER" "$API/projects/1/columns" |
    python3 -c 'import sys, json, random; print(random.choice(json.load(sys.stdin))["id"])')
  curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $OWNER" -H 'content-type: application/json' \
    -d "{\"column_id\":$column}" "$API/tasks/$task_id/column"
  curl -s -o /dev/null -H "Authorization: Bearer $OWNER" "$API/tasks/$task_id/audit"
  curl -s -o /dev/null -H "Authorization: Bearer $ASSIGNEE" -H 'content-type: application/json' \
    -d "{\"text\":\"Комментарий к задаче $round\"}" "$API/tasks/$task_id/comments"
done

echo "== client errors (4xx)"
for i in $(seq 1 5); do
  curl -s -o /dev/null "$API/auth/token" -H 'content-type: application/json' -d '{"email":"nobody@example.com"}'
  curl -s -o /dev/null -H "Authorization: Bearer not-a-token" "$API/projects"
  curl -s -o /dev/null -H "Authorization: Bearer $ASSIGNEE" "$API/tasks/999999"
  curl -s -o /dev/null -H "Authorization: Bearer $ASSIGNEE" "$API/projects/2/tasks"
done

if [ -z "${SKIP_INCIDENT:-}" ]; then
  echo "== incident: ml-worker down for ~2 minutes"
  $K scale deployment/ml-worker --replicas=0
  sleep 130
  $K scale deployment/ml-worker --replicas=1
  $K rollout status deployment/ml-worker --timeout=120s
fi
echo "done"
