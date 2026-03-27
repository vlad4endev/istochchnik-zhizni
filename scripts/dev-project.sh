#!/usr/bin/env bash
set -euo pipefail

WEB_PORT="${WEB_PORT:-8081}"
UI_PORT="$WEB_PORT"
API_PORT="${API_PORT:-40978}"
API_BASE_URL_FOR_FLUTTER="${API_BASE_URL:-http://localhost:${API_PORT}}"
PID_DIR=".run"
DEV_PID_FILE="${PID_DIR}/dev-project.pid"

mkdir -p "${PID_DIR}"
echo "$$" > "${DEV_PID_FILE}"

while lsof -iTCP:"${UI_PORT}" -sTCP:LISTEN >/dev/null 2>&1; do
  UI_PORT="$((UI_PORT + 1))"
done

echo "Starting API (npm run dev)..."
npm run dev &
API_PID=$!

cleanup() {
  echo ""
  echo "Stopping API..."
  kill "$API_PID" 2>/dev/null || true
  rm -f "${DEV_PID_FILE}"
}

trap cleanup EXIT INT TERM

echo "Starting Flutter UI in Chrome on port ${UI_PORT} (API ${API_BASE_URL_FOR_FLUTTER})..."
flutter run -d chrome --web-port "${UI_PORT}" \
  --dart-define=API_BASE_URL="${API_BASE_URL_FOR_FLUTTER}"
