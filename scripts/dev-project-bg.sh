#!/usr/bin/env bash
set -euo pipefail

WEB_PORT="${WEB_PORT:-8081}"
UI_PORT="$WEB_PORT"
API_PORT="${API_PORT:-40978}"
API_BASE_URL_FOR_FLUTTER="${API_BASE_URL:-http://localhost:${API_PORT}}"
PID_DIR=".run"
API_PID_FILE="${PID_DIR}/api.pid"
UI_PID_FILE="${PID_DIR}/flutter.pid"
UI_PORT_FILE="${PID_DIR}/flutter.port"
API_LOG_FILE="${PID_DIR}/api.log"
UI_LOG_FILE="${PID_DIR}/flutter.log"

mkdir -p "${PID_DIR}"

if [[ -f "${API_PID_FILE}" ]]; then
  API_PID="$(<"${API_PID_FILE}")"
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    echo "API уже запущен (PID ${API_PID})."
    exit 0
  fi
  rm -f "${API_PID_FILE}"
fi

if [[ -f "${UI_PID_FILE}" ]]; then
  UI_PID="$(<"${UI_PID_FILE}")"
  if [[ -n "${UI_PID}" ]] && kill -0 "${UI_PID}" 2>/dev/null; then
    echo "Flutter UI уже запущен (PID ${UI_PID})."
    exit 0
  fi
  rm -f "${UI_PID_FILE}"
fi

while lsof -iTCP:"${UI_PORT}" -sTCP:LISTEN >/dev/null 2>&1; do
  UI_PORT="$((UI_PORT + 1))"
done

echo "Запуск API в фоне..."
nohup npm run dev > "${API_LOG_FILE}" 2>&1 &
API_PID=$!
echo "${API_PID}" > "${API_PID_FILE}"

echo "Запуск Flutter UI в фоне (Chrome, порт ${UI_PORT}, API ${API_BASE_URL_FOR_FLUTTER})..."
nohup flutter run -d chrome --web-port "${UI_PORT}" \
  --dart-define=API_BASE_URL="${API_BASE_URL_FOR_FLUTTER}" > "${UI_LOG_FILE}" 2>&1 &
UI_PID=$!
echo "${UI_PID}" > "${UI_PID_FILE}"
echo "${UI_PORT}" > "${UI_PORT_FILE}"

sleep 1

if ! kill -0 "${API_PID}" 2>/dev/null; then
  echo "Ошибка: API не запустился. Смотрите лог ${API_LOG_FILE}"
  rm -f "${API_PID_FILE}"
  exit 1
fi

if ! kill -0 "${UI_PID}" 2>/dev/null; then
  echo "Ошибка: Flutter UI не запустился. Смотрите лог ${UI_LOG_FILE}"
  rm -f "${UI_PID_FILE}" "${UI_PORT_FILE}"
  kill "${API_PID}" 2>/dev/null || true
  rm -f "${API_PID_FILE}"
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
  echo "Ошибка: API процесс запущен, но не отвечает на http://localhost:${API_PORT}/"
  echo "Проверьте креды/доступ к БД в .env (DATABASE_URL)."
  echo "Лог API: ${API_LOG_FILE}"
  kill "${UI_PID}" 2>/dev/null || true
  kill "${API_PID}" 2>/dev/null || true
  rm -f "${API_PID_FILE}" "${UI_PID_FILE}" "${UI_PORT_FILE}"
  exit 1
fi

echo "Все сервисы запущены в фоне."
echo "API PID: ${API_PID}"
echo "Flutter PID: ${UI_PID}"
echo "Flutter URL: http://localhost:${UI_PORT}"
echo "Логи API: ${API_LOG_FILE}"
echo "Логи Flutter: ${UI_LOG_FILE}"
