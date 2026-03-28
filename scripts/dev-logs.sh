#!/usr/bin/env bash
set -euo pipefail

PID_DIR=".run"
BG_LOG_FILE="${PID_DIR}/dev-bg.log"
STACK_LOG_FILE="${PID_DIR}/stack-web.log"
API_LOG_FILE="${PID_DIR}/api.log"
LEGACY_UI_LOG="${PID_DIR}/flutter.log" # имя файла от старых запусков

if [[ ! -f "${BG_LOG_FILE}" ]] && [[ ! -f "${STACK_LOG_FILE}" ]] && [[ ! -f "${API_LOG_FILE}" ]] && [[ ! -f "${LEGACY_UI_LOG}" ]]; then
  echo "Логи не найдены. Запустите: npm run dev:start или npm run go:start"
  exit 1
fi

if [[ -f "${BG_LOG_FILE}" ]]; then
  echo "== dev-bg (${BG_LOG_FILE}) =="
  tail -n 80 "${BG_LOG_FILE}"
  echo ""
fi

if [[ -f "${STACK_LOG_FILE}" ]]; then
  echo "== stack-web (${STACK_LOG_FILE}) =="
  tail -n 80 "${STACK_LOG_FILE}"
  echo ""
fi

if [[ -f "${API_LOG_FILE}" ]]; then
  echo "== API only (${API_LOG_FILE}) =="
  tail -n 80 "${API_LOG_FILE}"
  echo ""
fi

if [[ -f "${LEGACY_UI_LOG}" ]]; then
  echo "== legacy log (${LEGACY_UI_LOG}) =="
  tail -n 80 "${LEGACY_UI_LOG}"
fi
