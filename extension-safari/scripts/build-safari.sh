#!/usr/bin/env bash
# Generate / refresh the Safari Xcode project from dist/safari/.
# Kept separate from esbuild — safari-web-extension-converter is brittle in CI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/dist/safari"
OUT="${ROOT}/safari-app"

if [[ ! -d "$DIST" ]]; then
  echo "Run: npm run build  (produces dist/safari/)" >&2
  exit 1
fi

rm -rf "$OUT"
xcrun safari-web-extension-converter "$DIST" \
  --project-location "$OUT" \
  --app-name "JobApplyAutofill" \
  --copy-resources

echo "Open: ${OUT}/JobApplyAutofill/JobApplyAutofill.xcodeproj"
echo "Select iPad or Mac run destination, build, enable in Settings → Safari → Extensions."
