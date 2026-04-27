#!/usr/bin/env bash
# ============================================================
#  serve.sh — launch Maqueen Lab locally on macOS / Linux.
#  Tries python3 first (everyone has it), falls back to npx serve.
#  Why: opening index.html via file:// triggers CORS errors on
#  manifest.json / product.json / build-info.json. Serving over
#  http://localhost makes them load cleanly. See README.md.
# ============================================================

set -e
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 tools/serve.py "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python tools/serve.py "$@"
fi

if command -v npx >/dev/null 2>&1; then
  echo "Python not found. Falling back to npx serve."
  exec npx serve .
fi

echo
echo "ERROR: neither Python nor Node/npx is installed."
echo "Install Python from https://python.org or Node from https://nodejs.org"
echo "and run this script again."
exit 1
