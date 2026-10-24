#!/usr/bin/env bash
# Packs homework #4: Отчёт.md at the archive root, the app's source code with the metrics,
# every manifest and Helm values used to deploy it, and (optionally) the screencast:
#   ./k8s/monitoring/pack.sh [path/to/screencast.mp4]
# Files come from git (tracked + new, .gitignore respected): no venvs, node_modules, builds.
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT="dist/task-scheduler-metrics.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p dist

cp k8s/monitoring/Отчёт.md "$STAGE/Отчёт.md"
git ls-files -z --cached --others --exclude-standard -- \
    services jobs apps k8s/*.yaml k8s/build-images.sh k8s/monitoring docker-compose.yml .env.example |
  while IFS= read -r -d '' f; do
    case "$f" in
      *.md|*/pack.sh) continue ;;  # only this report goes in; repo docs and packers stay out
    esac
    [ -f "$f" ] || continue                # deleted in the working tree
    mkdir -p "$STAGE/$(dirname "$f")"
    cp "$f" "$STAGE/$f"
  done
if [ $# -gt 0 ]; then
  cp "$1" "$STAGE/"
fi

# Python's zipfile marks non-ASCII names as UTF-8 (macOS zip does not), NFC for macOS NFD
rm -f "$OUT"
python3 - "$STAGE" "$OUT" <<'PY'
import os, sys, unicodedata, zipfile
stage, out = sys.argv[1], sys.argv[2]
count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for name in sorted(files):
            path = os.path.join(root, name)
            z.write(path, unicodedata.normalize("NFC", os.path.relpath(path, stage)))
            count += 1
print(f"{count} files")
PY
echo "-> $OUT"
