#!/usr/bin/env bash
set -euo pipefail

PID_DIR=".run"
API_LOG_FILE="${PID_DIR}/api.log"
UI_LOG_FILE="${PID_DIR}/flutter.log"

if [[ ! -f "${API_LOG_FILE}" ]] && [[ ! -f "${UI_LOG_FILE}" ]]; then
  echo "Логи не найдены. Запустите сначала: npm run dev:start"
  exit 1
fi

echo "== API logs (${API_LOG_FILE}) =="
if [[ -f "${API_LOG_FILE}" ]]; then
  tail -n 80 "${API_LOG_FILE}"
else
  echo "Файл отсутствует."
fi

echo
echo "== Flutter logs (${UI_LOG_FILE}) =="
if [[ -f "${UI_LOG_FILE}" ]]; then
  tail -n 80 "${UI_LOG_FILE}"
else
  echo "Файл отсутствует."
fi
