#!/usr/bin/env bash
set -euo pipefail

PID_DIR=".run"
BG_PID_FILE="${PID_DIR}/dev-bg.pid"
STACK_WEB_PID="${PID_DIR}/stack-web.pid"
API_PID_FILE="${PID_DIR}/api.pid"
# Старые pid-файлы от прежнего стека (до React-only)
UI_PID_FILE="${PID_DIR}/flutter.pid"
UI_PORT_FILE="${PID_DIR}/flutter.port"

status_line() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "${pid_file}" ]]; then
    echo "${name}: stopped"
    return
  fi

  local pid
  pid="$(<"${pid_file}")"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "${name}: running (PID ${pid})"
  else
    echo "${name}: stale pid file (${pid_file})"
  fi
}

status_line "Dev stack (npm run dev:start)" "${BG_PID_FILE}"
status_line "Project stack (npm run go:start)" "${STACK_WEB_PID}"
status_line "API (legacy api.pid)" "${API_PID_FILE}"
status_line "Legacy UI pid (старый формат)" "${UI_PID_FILE}"

echo "Vite UI: http://localhost:5173 (если стек запущен)"

if [[ -f "${UI_PORT_FILE}" ]]; then
  echo "Legacy UI port file: http://localhost:$(<"${UI_PORT_FILE}")"
fi
