#!/usr/bin/env bash
# Generate app icons from build/icon.svg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SVG="build/icon.svg"
PNG="build/icon.png"
ICNS="build/icon.icns"

if [[ ! -f "$SVG" ]]; then
  echo "Missing $SVG"
  exit 1
fi

echo "Rendering 1024px PNG..."
npx --yes @resvg/resvg-js-cli --fit-width 1024 "$SVG" "$PNG"

echo "Generating macOS .icns..."
npx --yes png2icons "$PNG" build/icon -icns
mv -f build/icon.icns "$ICNS"

echo "Done: $PNG"
echo "Done: $ICNS"
