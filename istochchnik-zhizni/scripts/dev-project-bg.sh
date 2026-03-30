#!/usr/bin/env bash
# API + Vite (web-react) в фоне — аналог npm run go:start, лог в .run/dev-bg.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-40978}"
PID_DIR=".run"
BG_PID_FILE="${PID_DIR}/dev-bg.pid"
BG_LOG_FILE="${PID_DIR}/dev-bg.log"

mkdir -p "${PID_DIR}"

if [[ -f "${BG_PID_FILE}" ]]; then
  old="$(<"${BG_PID_FILE}")"
  if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
    echo "Стек dev уже запущен (PID ${old}). UI: http://localhost:5173"
    exit 0
  fi
  rm -f "${BG_PID_FILE}"
fi

export API_PORT
export VITE_DEV_API_PROXY="${VITE_DEV_API_PROXY:-http://127.0.0.1:${API_PORT}}"

echo "Запуск API + Vite (web-react) в фоне…"
: >"${BG_LOG_FILE}"
nohup bash -c "cd \"$ROOT\" && export API_PORT=\"$API_PORT\" && export VITE_DEV_API_PROXY=\"$VITE_DEV_API_PROXY\" && exec npx concurrently -k -n api,web -c blue,magenta \"npm run dev\" \"npm run web:dev\"" >>"${BG_LOG_FILE}" 2>&1 &
echo $! >"${BG_PID_FILE}"

sleep 2

bg_pid="$(<"${BG_PID_FILE}")"
if [[ -z "${bg_pid}" ]] || ! kill -0 "${bg_pid}" 2>/dev/null; then
  echo "Ошибка: процесс не запустился. Смотрите ${BG_LOG_FILE}" >&2
  rm -f "${BG_PID_FILE}"
  exit 1
fi

API_HEALTH_OK=false
for _ in {1..15}; do
  if curl -fsS "http://localhost:${API_PORT}/" >/dev/null 2>&1; then
    API_HEALTH_OK=true
    break
  fi
  sleep 1
done

if [[ "${API_HEALTH_OK}" != "true" ]]; then
  echo "Ошибка: API не отвечает на http://localhost:${API_PORT}/ — проверьте DATABASE_URL в .env"
  echo "Лог: ${BG_LOG_FILE}"
  kill "${bg_pid}" 2>/dev/null || true
  rm -f "${BG_PID_FILE}"
  exit 1
fi

echo "Готово."
echo "  UI:  http://localhost:5173"
echo "  API: http://localhost:${API_PORT}"
echo "  PID: ${bg_pid}"
echo "  Лог: ${BG_LOG_FILE}"
