#!/usr/bin/env bash
# Packs homework #6: Отчёт.md at the archive root, the app source code (fault injection,
# metrics), every manifest and Helm values, SLO and alert rules, Alertmanager config and
# (optionally) screenshots:
#   ./k8s/alerting/pack.sh [screenshot.png | screenshots-dir ...]   (go to screenshots/)
# Files come from git (tracked + new, .gitignore respected): no venvs, node_modules, builds.
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT="dist/task-scheduler-alerting.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p dist

cp k8s/alerting/Отчёт.md "$STAGE/Отчёт.md"
git ls-files -z --cached --others --exclude-standard -- \
    services jobs apps k8s/*.yaml k8s/build-images.sh k8s/monitoring k8s/slo k8s/alerting docker-compose.yml .env.example |
  while IFS= read -r -d '' f; do
    case "$f" in
      *.md|*/pack.sh) continue ;;  # only this report goes in; repo docs and packers stay out
    esac
    [ -f "$f" ] || continue                # deleted in the working tree
    mkdir -p "$STAGE/$(dirname "$f")"
    cp "$f" "$STAGE/$f"
  done
for extra in "$@"; do
  mkdir -p "$STAGE/screenshots"
  if [ -d "$extra" ]; then cp "$extra"/* "$STAGE/screenshots/"; else cp "$extra" "$STAGE/screenshots/"; fi
done

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
