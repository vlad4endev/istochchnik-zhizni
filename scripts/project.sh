#!/usr/bin/env bash
# Запуск / обновление / остановка: API (Express) + фронт web-react (Vite).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PID_DIR=".run"
mkdir -p "$PID_DIR"
WEB_STACK_PID="${PID_DIR}/stack-web.pid"
LOG_WEB="${PID_DIR}/stack-web.log"
UPDATE_LOG_DIR="${PID_DIR}/updates"

usage() {
  echo "Использование: $(basename "$0") start | update | stop"
  echo ""
  echo "  start   — API + Vite (http://localhost:5173)"
  echo "  update  — полное обновление: git pull, зависимости, сборки, Docker (лог в ${UPDATE_LOG_DIR}/)"
  echo "  stop    — остановить API+Vite и прочие процессы разработки из scripts/dev-stop.sh"
  echo ""
  echo "Переменные для update:"
  echo "  OFFLINE=1          — без git pull"
  echo "  SKIP_DOCKER=1      — без docker compose (только локальная сборка; в конце db:up для dev-БД)"
  echo "  UPDATE_COMPOSE_FILES=\"-f a.yml -f b.yml\"  — доп. compose-файлы к docker compose up -d --build"
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
  mkdir -p "${ROOT}/${UPDATE_LOG_DIR}"
  local log_file="${ROOT}/${UPDATE_LOG_DIR}/update-$(date +%Y%m%d-%H%M%S).log"
  local latest="${ROOT}/${UPDATE_LOG_DIR}/latest.log"

  # Весь вывод — в терминал и в файл; при ошибке в подпроцессе pipeline падает (pipefail)
  (
    set -euo pipefail
    cd "$ROOT"

    _ts() { date '+%Y-%m-%d %H:%M:%S'; }

    section() {
      echo ""
      echo "[$( _ts )] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "[$( _ts )] ▶ $1"
      echo "[$( _ts )] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    }

    section "Начало полного обновления"
    echo "[$( _ts )] Каталог: $ROOT"
    echo "[$( _ts )] Лог-файл: $log_file"
    echo "[$( _ts )] OFFLINE=${OFFLINE:-0}  SKIP_DOCKER=${SKIP_DOCKER:-0}"

    if [[ "${OFFLINE:-0}" != "1" ]] && command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
      section "Git: связь с GitHub и pull"
      echo "[$( _ts )] Текущая ветка: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
      git remote -v | head -6 || true
      # npm на сервере меняет package.json / lock — иначе git pull падает с «would be overwritten by merge»
      echo "[$( _ts )] Сброс локальных правок package*.json / lock и артефактов сборки…"
      for _pkg in package.json package-lock.json web-react/package.json web-react/package-lock.json web-react/tsconfig.tsbuildinfo web-react/vite.config.ts web-react/src/features/resources/pages/PodcastsPage.tsx; do
        if [[ -f "$_pkg" ]]; then
          git restore -- "$_pkg" 2>/dev/null || git checkout -- "$_pkg" 2>/dev/null || true
        fi
      done
      echo "[$( _ts )] Выполняю: git fetch origin …"
      git fetch origin
      echo "[$( _ts )] Выполняю: git pull --ff-only …"
      git pull --ff-only
      echo "[$( _ts )] ✓ Репозиторий обновлён"
    else
      section "Git: пропуск"
      echo "[$( _ts )] (OFFLINE=1 или нет git) — git pull не выполнялся"
    fi

    section "Файл окружения .env"
    if [[ ! -f .env ]]; then
      if [[ -f .env.example ]]; then
        cp .env.example .env
        echo "[$( _ts )] Создан .env из .env.example — проверьте DATABASE_URL"
      else
        echo "[$( _ts )] ⚠ Нет .env и .env.example"
      fi
    else
      echo "[$( _ts )] ✓ .env на месте"
    fi

    section "Остановка локальной разработки (освобождение портов перед Docker)"
    cmd_stop || true
    echo "[$( _ts )] ✓ Локальные dev-процессы остановлены"

    section "npm install — корень репозитория (API / tooling)"
    npm install
    echo "[$( _ts )] ✓ Зависимости корня установлены"

    if [[ -f web-react/package.json ]]; then
      section "npm install — web-react"
      npm --prefix web-react install
      echo "[$( _ts )] ✓ Зависимости web-react установлены"
    fi

    section "Сборка TypeScript API (npm run build)"
    npm run build
    echo "[$( _ts )] ✓ API собран в dist/"

    section "Сборка web-react для сервера (scripts/package-web-for-server.sh → release/web/)"
    bash "$ROOT/scripts/package-web-for-server.sh"
    echo "[$( _ts )] ✓ Статика для nginx готова в release/web/"

    if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
      section "Docker: пропуск (SKIP_DOCKER=1)"
      if [[ "${SKIP_DB:-0}" != "1" ]]; then
        echo "[$( _ts )] Локальная БД для dev: npm run db:up"
        npm run db:up 2>/dev/null || echo "[$( _ts )] ⚠ db:up не выполнен (нет Docker или ошибка)"
      fi
    else
      section "Docker: пересборка образов и перезапуск контейнеров"
      if ! command -v docker >/dev/null 2>&1; then
        echo "[$( _ts )] ❌ docker не найден в PATH. Установите Docker или задайте SKIP_DOCKER=1" >&2
        exit 1
      fi
      echo "[$( _ts )] Выполняю: docker compose … up -d --build"
      if [[ -n "${UPDATE_COMPOSE_FILES:-}" ]]; then
        # shellcheck disable=SC2086
        docker compose ${UPDATE_COMPOSE_FILES} up -d --build
      else
        docker compose up -d --build
      fi
      echo "[$( _ts )] ✓ Контейнеры пересобраны и запущены"
      echo "[$( _ts )] Статус контейнеров:"
      if [[ -n "${UPDATE_COMPOSE_FILES:-}" ]]; then
        # shellcheck disable=SC2086
        docker compose ${UPDATE_COMPOSE_FILES} ps 2>/dev/null || true
      else
        docker compose ps 2>/dev/null || true
      fi
    fi

    section "Готово"
    echo "[$( _ts )] ✅ Полное обновление завершено без ошибок."
    echo "[$( _ts )] Полный лог сохранён: $log_file"
  ) 2>&1 | tee -a "$log_file"

  local exit_code=${PIPESTATUS[0]}
  ln -sf "$log_file" "$latest" 2>/dev/null || cp -f "$log_file" "$latest"

  if [[ "$exit_code" -ne 0 ]]; then
    echo ""
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Обновление прервано (код выхода: $exit_code)."
    echo "Смотрите лог: $log_file"
    exit "$exit_code"
  fi

  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Лог продублирован: $latest"
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
