#!/usr/bin/env bash
# Запуск / обновление / остановка: API (Express) + фронт web-react (Vite).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PID_DIR=".run"
mkdir -p "$PID_DIR"
WEB_STACK_PID="${PID_DIR}/stack-web.pid"
LOG_WEB="${PID_DIR}/stack-web.log"

usage() {
  echo "Использование: $(basename "$0") start | update | stop"
  echo ""
  echo "  start   — API + Vite (http://localhost:5173)"
  echo "  update  — git pull, npm install, сборка API, при необходимости db:up"
  echo "  stop    — остановить API+Vite и прочие процессы разработки из scripts/dev-stop.sh"
}

cmd_start() {
  start_web_background
}

start_web_background() {
  if [[ -f "$WEB_STACK_PID" ]]; then
    local old
    old="$(<"$WEB_STACK_PID")"
    if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
      echo "[project] Уже запущено (PID $old)."
      echo "  UI:  http://localhost:5173"
      echo "  API: http://localhost:${API_PORT:-40978}"
      return 0
    fi
    rm -f "$WEB_STACK_PID"
  fi

  local api_port="${API_PORT:-40978}"
  export API_PORT
  export VITE_DEV_API_PROXY="${VITE_DEV_API_PROXY:-http://127.0.0.1:${api_port}}"

  if [[ "${SKIP_DB:-0}" != "1" ]]; then
    npm run db:up 2>/dev/null || echo "[project] db:up пропущен или с ошибкой (Docker/БД)."
  fi

  echo "[project] Запуск API + Vite (web-react), лог: $LOG_WEB"
  : >"$LOG_WEB"
  nohup bash -c "cd \"$ROOT\" && export API_PORT=\"$api_port\" && export VITE_DEV_API_PROXY=\"$VITE_DEV_API_PROXY\" && exec npx concurrently -k -n api,web -c blue,magenta \"npm run dev\" \"npm run web:dev\"" >>"$LOG_WEB" 2>&1 &
  echo $! >"$WEB_STACK_PID"
  sleep 2
  local pid
  pid="$(<"$WEB_STACK_PID")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[project] Готово."
    echo "  UI:  http://localhost:5173"
    echo "  API: http://localhost:${api_port}"
    echo "  Остановка: npm run go:stop"
  else
    echo "[project] Не удалось запустить. Смотрите $LOG_WEB" >&2
    rm -f "$WEB_STACK_PID"
    exit 1
  fi
}

cmd_update() {
  if [[ "${OFFLINE:-0}" != "1" ]] && command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
    echo "[project] git pull…"
    git pull --ff-only || echo "[project] git pull пропущен (конфликт или нет сети)."
  fi

  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      echo "[project] Создан .env из .env.example — проверьте DATABASE_URL."
    fi
  fi

  echo "[project] npm install (корень)…"
  npm install

  if [[ -f web-react/package.json ]]; then
    echo "[project] npm install (web-react)…"
    npm --prefix web-react install
  fi

  echo "[project] Сборка TypeScript API…"
  npm run build

  if [[ "${SKIP_DB:-0}" != "1" ]]; then
    npm run db:up 2>/dev/null || echo "[project] db:up пропущен."
  fi

  echo "[project] Обновление завершено."
}

cmd_stop() {
  if [[ -f "$WEB_STACK_PID" ]]; then
    local pid
    pid="$(<"$WEB_STACK_PID")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[project] Останавливаю API + Vite (PID $pid)…"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$WEB_STACK_PID"
  fi

  if pgrep -f "concurrently.*api,web" >/dev/null 2>&1; then
    pkill -f "concurrently.*api,web" || true
  fi

  bash "$ROOT/scripts/dev-stop.sh"
}

main() {
  case "${1:-}" in
    start) cmd_start ;;
    update) cmd_update ;;
    stop) cmd_stop ;;
    ""|-h|--help|help) usage ;;
    *)
      echo "Неизвестная команда: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
