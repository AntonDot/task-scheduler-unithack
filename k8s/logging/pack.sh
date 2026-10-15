#!/usr/bin/env bash
# Packs homework #2: Отчёт.md and screenshots/ at the archive root, the logging stack
# manifests, and the app files that switched logs to the JSON schema.
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT="dist/task-scheduler-logging.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/k8s/logging" dist
cp k8s/logging/Отчёт.md "$STAGE/Отчёт.md"
cp -R k8s/logging/screenshots "$STAGE/screenshots"
cp k8s/logging/*.yaml k8s/logging/*.sh "$STAGE/k8s/logging/"
for f in services/core-api/app/logging_config.py services/ml-worker/app/logging_config.py \
         services/mock-review-board/app/logging_config.py services/mock-review-board/app/main.py \
         services/automation-worker/main.py jobs/review-scraper/scraper.py \
         apps/web/nginx/default.conf.template; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done

# Python's zipfile marks non-ASCII names as UTF-8 (macOS zip does not), NFC for macOS NFD
rm -f "$OUT"
python3 - "$STAGE" "$OUT" <<'PY'
import os, sys, unicodedata, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for name in sorted(files):
            path = os.path.join(root, name)
            arc = unicodedata.normalize("NFC", os.path.relpath(path, stage))
            z.write(path, arc)
            print("  " + arc)
PY
echo "-> $OUT"
