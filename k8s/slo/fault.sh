#!/usr/bin/env bash
# Changes how the app behaves, to watch SLIs, SLOs, the SLA (homework #5) and alerts (#6) react.
#
#   ./k8s/slo/fault.sh errors 0.3    — core-api answers 503 to 30 % of /api/ requests
#   ./k8s/slo/fault.sh latency 800   — core-api adds 800 ms to every /api/ request
#   ./k8s/slo/fault.sh ml-down       — ml-worker scaled to 0: review scraper runs fail
#   ./k8s/slo/fault.sh memory 350    — core-api holds 350 MB from startup, as if it leaked
#   ./k8s/slo/fault.sh bad-logins    — ~3 min of failed logins (guessed emails)
#   ./k8s/slo/fault.sh off           — everything back to normal
#   ./k8s/slo/fault.sh status        — what is injected now
#
# errors/latency/memory set CORE_FAULT_* on the core-api Deployment (they override the ConfigMap);
# Kubernetes rolls the pods with the new value, which takes ~20 s.
set -euo pipefail

K="kubectl --context ${KUBE_CONTEXT:-minikube} -n task-scheduler"

case "${1:-status}" in
  errors)
    $K set env deployment/core-api -c core-api CORE_FAULT_ERROR_RATE="${2:?share of failing requests, e.g. 0.3}"
    $K rollout status deployment/core-api --timeout=120s
    ;;
  latency)
    $K set env deployment/core-api -c core-api CORE_FAULT_LATENCY_MS="${2:?delay in ms, e.g. 800}"
    $K rollout status deployment/core-api --timeout=120s
    ;;
  ml-down)
    $K scale deployment/ml-worker --replicas=0
    ;;
  memory)
    $K set env deployment/core-api -c core-api CORE_FAULT_MEMORY_MB="${2:?megabytes, e.g. 350}"
    $K rollout status deployment/core-api --timeout=120s
    ;;
  bad-logins)
    # From inside the cluster (the prober pod has Python + httpx), through nginx like a browser:
    # 2 attempts a second with guessed emails: fails with CORE_DEV_LOGIN=true too (no password
    # check there), counted as taskscheduler_logins_total{result="unknown_user"}
    $K exec deployment/prober -- python -c '
import time, httpx
for i in range(360):
    httpx.post("http://web:80/api/v1/auth/token", json={"email": f"admin{i}@victorygroup.ru", "password": "123456"})
    time.sleep(0.5)
    if i % 60 == 59: print(f"{i + 1} failed logins", flush=True)
'
    ;;
  off)
    # `NAME-` removes the override, the ConfigMap value (0) applies again
    $K set env deployment/core-api -c core-api CORE_FAULT_ERROR_RATE- CORE_FAULT_LATENCY_MS- CORE_FAULT_MEMORY_MB-
    $K scale deployment/ml-worker --replicas=1
    $K rollout status deployment/core-api --timeout=120s
    $K rollout status deployment/ml-worker --timeout=120s
    ;;
  status)
    echo "core-api overrides:"
    $K set env deployment/core-api -c core-api --list | grep CORE_FAULT_ || echo "  none"
    echo "ml-worker replicas: $($K get deployment/ml-worker -o jsonpath='{.spec.replicas}')"
    ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac
