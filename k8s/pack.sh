#!/usr/bin/env bash
# Packs the deliverable: Отчёт.md at the archive root, manifests, Dockerfiles and the
# nginx template. Put the screencast next to it: ./k8s/pack.sh path/to/screencast.mp4
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="dist/task-scheduler-minikube.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/k8s" dist
cp k8s/Отчёт.md "$STAGE/Отчёт.md"
cp k8s/*.yaml k8s/build-images.sh k8s/pack.sh "$STAGE/k8s/"
for f in services/*/Dockerfile services/*/.dockerignore jobs/review-scraper/Dockerfile \
         jobs/review-scraper/.dockerignore apps/web/Dockerfile apps/web/.dockerignore \
         apps/web/nginx/default.conf.template; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done
if [ $# -gt 0 ]; then
  cp "$1" "$STAGE/"
fi

# Python's zipfile marks non-ASCII names as UTF-8 (macOS zip does not), so Отчёт.md
# unpacks with a readable name on Windows too; NFC because macOS may hand out NFD.
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
