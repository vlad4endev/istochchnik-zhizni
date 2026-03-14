#!/usr/bin/env bash
set -euo pipefail

PID_FILE=".run/dev-project.pid"
stopped=false

if [[ -f "${PID_FILE}" ]]; then
  DEV_PID="$(<"${PID_FILE}")"
  if [[ -n "${DEV_PID}" ]] && kill -0 "${DEV_PID}" 2>/dev/null; then
    echo "Stopping dev launcher (PID ${DEV_PID})..."
    kill "${DEV_PID}" 2>/dev/null || true
    stopped=true
  fi
  rm -f "${PID_FILE}"
fi

for pattern in \
  "ts-node-dev --respawn src/index.ts" \
  "node dist/index.js" \
  "flutter run -d chrome --web-port"; do
  if pgrep -f "${pattern}" >/dev/null 2>&1; then
    echo "Stopping process: ${pattern}"
    pkill -f "${pattern}" || true
    stopped=true
  fi
done

if [[ "${stopped}" == "true" ]]; then
  echo "Development processes stopped."
else
  echo "No development processes were running."
fi
