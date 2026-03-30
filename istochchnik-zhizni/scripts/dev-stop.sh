#!/usr/bin/env bash
set -euo pipefail

PID_DIR=".run"
PID_FILE="${PID_DIR}/dev-project.pid"
BG_PID_FILE="${PID_DIR}/dev-bg.pid"
STACK_WEB_PID="${PID_DIR}/stack-web.pid"
API_PID_FILE="${PID_DIR}/api.pid"
UI_PID_FILE="${PID_DIR}/flutter.pid"
UI_PORT_FILE="${PID_DIR}/flutter.port"
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

for pid_file in "${BG_PID_FILE}" "${STACK_WEB_PID}" "${API_PID_FILE}" "${UI_PID_FILE}"; do
  if [[ -f "${pid_file}" ]]; then
    PID_VALUE="$(<"${pid_file}")"
    if [[ -n "${PID_VALUE}" ]] && kill -0 "${PID_VALUE}" 2>/dev/null; then
      echo "Stopping PID ${PID_VALUE} from ${pid_file}..."
      kill "${PID_VALUE}" 2>/dev/null || true
      sleep 1
      kill -9 "${PID_VALUE}" 2>/dev/null || true
      stopped=true
    fi
    rm -f "${pid_file}"
  fi
done

for pattern in \
  "ts-node-dev --respawn src/main.ts" \
  "node dist/main.js" \
  "concurrently -k -n api,web" \
  "concurrently.*api,flutter" \
  "flutter run -d chrome --web-port"; do
  if pgrep -f "${pattern}" >/dev/null 2>&1; then
    echo "Stopping process: ${pattern}"
    pkill -f "${pattern}" || true
    stopped=true
  fi
done

rm -f "${UI_PORT_FILE}"

if [[ "${stopped}" == "true" ]]; then
  echo "Development processes stopped."
else
  echo "No development processes were running."
fi
