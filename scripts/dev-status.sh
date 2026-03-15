#!/usr/bin/env bash
set -euo pipefail

PID_DIR=".run"
API_PID_FILE="${PID_DIR}/api.pid"
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

status_line "API" "${API_PID_FILE}"
status_line "Flutter" "${UI_PID_FILE}"

if [[ -f "${UI_PORT_FILE}" ]]; then
  echo "Flutter URL: http://localhost:$(<"${UI_PORT_FILE}")"
fi
