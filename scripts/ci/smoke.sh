#!/usr/bin/env bash
set -euo pipefail

API="${E2E_CORE_API_URL:-http://localhost:8000}"
ML="${E2E_ML_WORKER_URL:-http://localhost:8001}"
REVIEW="${E2E_REVIEW_BOARD_URL:-http://localhost:8002}"

echo "=== Smoke Test Suite ==="

echo "[1/7] Core API health check"
curl -sf "$API/health" | grep -q '"status":"ok"'
echo "  OK"

echo "[2/7] ML Worker health check"
curl -sf "$ML/health" | grep -q '"status":"ok"'
echo "  OK"

echo "[3/7] Mock Review Board health check"
curl -sf "$REVIEW/health" | grep -q '"status":"ok"'
echo "  OK"

echo "[4/7] Get auth token"
TOKEN=$(curl -sf -X POST "$API/api/v1/auth/token" \
  -H "Content-Type: application/json" \
  -d '{"email":"d.morozov@victorygroup.ru"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "  OK (token received)"

echo "[5/6] List projects"
PROJECTS=$(curl -sf "$API/api/v1/projects" \
  -H "Authorization: Bearer $TOKEN")
echo "$PROJECTS" | python3 -c "import sys,json; data=json.load(sys.stdin); assert len(data) > 0, 'No projects found'"
echo "  OK ($(echo "$PROJECTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" ) projects)"

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

echo "[6/7] List tasks for project $PROJECT_ID"
TASKS=$(curl -sf "$API/api/v1/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $TOKEN")
echo "$TASKS" | python3 -c "import sys,json; data=json.load(sys.stdin); assert isinstance(data, list)"
echo "  OK ($(echo "$TASKS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" ) tasks)"

echo "[7/7] E2E incident -> task creation flow"
MARKER="smoke-e2e-$(date +%s)"
curl -sf -X POST "$ML/webhook/incident" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${SCRAPER_WEBHOOK_API_KEY:-dev-webhook-key}" \
  -d "{\"event_id\":\"$MARKER\",\"source\":\"smoke\",\"text\":\"$MARKER\",\"urgency\":\"URGENT\",\"project_slug\":\"onegin-park\",\"external_rating\":1}" > /dev/null

FOUND=0
for i in $(seq 1 20); do
  TASKS_AFTER=$(curl -sf "$API/api/v1/projects/$PROJECT_ID/tasks" \
    -H "Authorization: Bearer $TOKEN")
  if echo "$TASKS_AFTER" | python3 -c "import sys,json; m='$MARKER'; print(any(m in (t.get('title') or '') or m in (t.get('description') or '') for t in json.load(sys.stdin)))" | grep -q "True"; then
    FOUND=1
    break
  fi
  sleep 0.5
done

if [ "$FOUND" -ne 1 ]; then
  echo "  FAIL: E2E incident marker task not found"
  exit 1
fi
echo "  OK (marker task created)"

echo ""
echo "=== All smoke tests passed ==="
