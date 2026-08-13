#!/usr/bin/env bash
# Однокомандное обновление проекта на сервере.
#
# Что делает:
#   1) git fetch + pull --ff-only
#   2) обновление зависимостей и сборка (через Docker build; опционально на хосте)
#   3) пересборка и перезапуск контейнеров
#   4) миграции БД при необходимости (initDb + CLI-миграции)
#   5) проверка health сервисов
#
# Запуск из корня репозитория:
#   bash scripts/server-update.sh
#   npm run server:update
#
# Переменные окружения:
#   OFFLINE=1              — без git pull
#   SKIP_MIGRATE=1         — без миграций после перезапуска
#   SKIP_DOCKER=1          — только git + npm install + локальная сборка (без compose)
#   HOST_BUILD=1           — дополнительно npm ci/build на хосте (API + web-react)
#   PREBUILT_WEB=1         — собрать статику в release/web/ и подключить web-prebuilt overlay
#   USE_PROD_OVERLAY=1     — docker-compose.prod.overlay.yml (API на loopback)
#   RUN_SUPABASE_PUSH=1    — дополнительно npx supabase db push (нужен DATABASE_URL)
#   UPDATE_COMPOSE_FILES=… — свои флаги compose, напр. "-f docker-compose.yml -f …"
#   SERVICES=api web       — какие сервисы пересобирать (по умолчанию весь стек)
#   BACKUP_BEFORE_UPDATE=1 — полный бекап БД+uploads перед обновлением (рекомендуется)
#   SKIP_BACKUP=1          — не делать бекап даже если BACKUP_BEFORE_UPDATE=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REDIS_ADDON_FILE="docker-compose.redis-addon.yml"
PROD_OVERLAY_FILE="docker-compose.prod.overlay.yml"
WEB_PREBUILT_FILE="docker-compose.web-prebuilt.yml"
LOG_DIR=".run/updates"
COMPOSE_ARGS=()

log() {
  echo "[server-update $(date '+%H:%M:%S')] $*"
}

die() {
  echo "[server-update] ERROR: $*" >&2
  exit 1
}

env_flag_true() {
  local key="$1"
  local val="${!key:-}"
  if [[ -n "$val" ]]; then
    [[ "$val" == "true" || "$val" == "1" ]]
    return
  fi
  if [[ -f ".env" ]]; then
    val="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | tr -d '"'\''[:space:]')"
    [[ "$val" == "true" || "$val" == "1" ]]
    return
  fi
  return 1
}

restore_pull_blockers() {
  # Локальные правки на сервере (npm/сборка, ручной compose) иначе ломают git pull
  local files=(
    package.json
    package-lock.json
    web-react/package.json
    web-react/package-lock.json
    web-react/tsconfig.tsbuildinfo
    web-react/vite.config.ts
    web-react/src/features/resources/pages/PodcastsPage.tsx
    docker-compose.yml
    docker-compose.prod.yml
    docker-compose.prod.overlay.yml
    docker-compose.portainer.stack.yml
    docker-compose.portainer.yml
    docker-compose.local.yml
    docker-compose.redis-addon.yml
    docker-compose.web-prebuilt.yml
    docker-compose.web-split.yml
  )
  local f
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      git restore -- "$f" 2>/dev/null || git checkout -- "$f" 2>/dev/null || true
    fi
  done
}

setup_compose_args() {
  if [[ -n "${UPDATE_COMPOSE_FILES:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_ARGS=(${UPDATE_COMPOSE_FILES})
    log "Compose: UPDATE_COMPOSE_FILES=${UPDATE_COMPOSE_FILES}"
    return
  fi

  COMPOSE_ARGS=(-f docker-compose.yml)

  if [[ "${USE_PROD_OVERLAY:-0}" == "1" ]] || env_flag_true "USE_PROD_OVERLAY"; then
    if [[ -f "$PROD_OVERLAY_FILE" ]]; then
      COMPOSE_ARGS+=(-f "$PROD_OVERLAY_FILE")
      log "Compose: prod overlay ($PROD_OVERLAY_FILE)"
    fi
  fi

  if [[ "${PREBUILT_WEB:-0}" == "1" ]]; then
    if [[ -f "$WEB_PREBUILT_FILE" ]]; then
      COMPOSE_ARGS+=(-f "$WEB_PREBUILT_FILE")
      log "Compose: web-prebuilt ($WEB_PREBUILT_FILE)"
    else
      die "PREBUILT_WEB=1, но нет $WEB_PREBUILT_FILE"
    fi
  fi

  if [[ -f "$REDIS_ADDON_FILE" ]] && env_flag_true "REDIS_REALTIME_ENABLED"; then
    COMPOSE_ARGS+=(-f "$REDIS_ADDON_FILE")
    log "Compose: redis addon ($REDIS_ADDON_FILE)"
  fi
}

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

wait_service_ready() {
  local service="$1"
  local timeout="${2:-120}"
  local started_at now elapsed status container_id
  started_at="$(date +%s)"

  container_id="$(compose ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    log "Сервис '$service' не найден в compose — пропускаю ожидание"
    return 0
  fi

  while true; do
    now="$(date +%s)"
    elapsed=$((now - started_at))
    if (( elapsed > timeout )); then
      log "Таймаут ожидания '$service' (${timeout}s)"
      compose ps || true
      return 1
    fi

    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      log "Сервис '$service' готов: $status"
      return 0
    fi
    sleep 2
  done
}

run_init_db_safe() {
  local output status
  set +e
  output="$(compose exec -T api node dist/cli/runInitDb.js 2>&1)"
  status=$?
  set -e

  printf '%s\n' "$output"
  if [[ $status -eq 0 ]]; then
    return 0
  fi

  # Supabase / managed PG: роль API часто не owner — не валим весь деплой
  if [[ "$output" == *"must be owner of table"* ]] || [[ "$output" == *"code: '42501'"* ]]; then
    log "initDb пропущен: нет прав владельца (42501). Миграции SQL — через владельца БД / RUN_SUPABASE_PUSH=1."
    return 0
  fi

  return "$status"
}

run_cli_migrate() {
  local label="$1"
  local script="$2"
  local status
  log "Миграция: $label"
  set +e
  compose exec -T api node "dist/cli/${script}" 2>&1
  status=$?
  set -e
  if [[ $status -ne 0 ]]; then
    log "Предупреждение: $script завершился с кодом $status (образ старый или нет прав на DDL)"
  fi
}

host_install_and_build() {
  log "npm ci — корень (API)"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi

  log "Сборка API (tsc → dist/)"
  npm run build

  if [[ -f web-react/package.json ]]; then
    log "npm ci + build — web-react → release/web/"
    bash "$ROOT/scripts/package-web-for-server.sh"
  fi
}

run_migrations() {
  if [[ "${SKIP_MIGRATE:-0}" == "1" ]]; then
    log "Миграции пропущены (SKIP_MIGRATE=1)"
    return 0
  fi

  log "Ожидаю API перед миграциями…"
  wait_service_ready api 120

  log "initDb (схема/индексы внутри API-контейнера)"
  run_init_db_safe

  run_cli_migrate "media schedule" "applyMediaScheduleMigrations.js"
  run_cli_migrate "song import catalog" "applySongImportMigrations.js"

  if [[ "${RUN_SUPABASE_PUSH:-0}" == "1" ]]; then
    log "supabase db push (RUN_SUPABASE_PUSH=1)"
    bash "$ROOT/scripts/supabase-db-push.sh"
  fi
}

# ─── main ───────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  cat <<'EOF'
Однокомандное обновление проекта на сервере.

  bash scripts/server-update.sh
  npm run server:update

Шаги: git pull → (опц. host build) → docker compose up -d --build → миграции → health.

Переменные:
  OFFLINE=1              без git pull
  SKIP_DOCKER=1          только host build (нужен HOST_BUILD=1 или PREBUILT_WEB=1)
  HOST_BUILD=1           npm ci + build API и web на хосте
  PREBUILT_WEB=1         HOST_BUILD + overlay docker-compose.web-prebuilt.yml
  USE_PROD_OVERLAY=1     overlay docker-compose.prod.overlay.yml
  SKIP_MIGRATE=1         без initDb / CLI-миграций
  RUN_SUPABASE_PUSH=1    supabase db push после контейнеров
  SERVICES="api web"     пересобрать только эти сервисы
  UPDATE_COMPOSE_FILES=  свои -f флаги compose
  BACKUP_BEFORE_UPDATE=1 полный бекап БД+uploads до обновления
  SKIP_BACKUP=1          отключить бекап
EOF
  exit 0
fi

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/server-update-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="${LOG_DIR}/latest.log"

exec > >(tee -a "$LOG_FILE") 2>&1
ln -sfn "$(basename "$LOG_FILE")" "$LATEST_LOG" 2>/dev/null || cp -f "$LOG_FILE" "$LATEST_LOG"

log "Каталог: $ROOT"
log "Лог: $LOG_FILE"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    log "Создан .env из .env.example — проверьте DATABASE_URL перед продом"
  elif [[ -f .env.local.example ]]; then
    cp .env.local.example .env
    log "Создан .env из .env.local.example — проверьте DATABASE_URL"
  else
    die "Нет .env. Скопируйте .env.example → .env и задайте DATABASE_URL"
  fi
fi

# 0) Бекап до любых разрушительных шагов (git pull / recreate)
if [[ "${SKIP_BACKUP:-0}" != "1" ]] && { [[ "${BACKUP_BEFORE_UPDATE:-0}" == "1" ]] || env_flag_true "BACKUP_BEFORE_UPDATE"; }; then
  log "Бекап перед обновлением (BACKUP_BEFORE_UPDATE)…"
  bash "$ROOT/scripts/backup.sh" create || die "Бекап перед обновлением не удался — обновление отменено"
  log "Бекап OK (backups/latest)"
else
  log "Бекап перед обновлением пропущен (включите BACKUP_BEFORE_UPDATE=1 в .env для защиты данных)"
fi

# 1) Git
if [[ "${OFFLINE:-0}" != "1" ]] && command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  log "Git: сброс локальных правок, мешающих pull"
  restore_pull_blockers
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
  log "Git: ветка $branch — fetch + pull --ff-only"
  git fetch origin
  git pull --ff-only
  export GITHUB_SHA
  GITHUB_SHA="$(git rev-parse --short HEAD)"
  log "Git: обновлено до ${GITHUB_SHA}"
else
  export GITHUB_SHA
  GITHUB_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
  log "Git: пропуск (OFFLINE=1 или нет .git), SHA=${GITHUB_SHA}"
fi

# 2) Зависимости / сборка на хосте (опционально)
if [[ "${HOST_BUILD:-0}" == "1" || "${PREBUILT_WEB:-0}" == "1" || "${SKIP_DOCKER:-0}" == "1" ]]; then
  host_install_and_build
fi

# 3) Docker: deps обновляются через npm ci в Dockerfile при --build
if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
  log "Docker пропущен (SKIP_DOCKER=1). Локальная сборка уже выполнена."
  log "Готово (без контейнеров)."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  die "docker не найден. Установите Docker или запустите с SKIP_DOCKER=1 HOST_BUILD=1"
fi

setup_compose_args
log "Пересобираю и перезапускаю контейнеры (GITHUB_SHA=${GITHUB_SHA})"

if [[ -n "${SERVICES:-}" ]]; then
  # shellcheck disable=SC2086
  compose up -d --build --force-recreate --no-deps $SERVICES
else
  compose up -d --build --force-recreate
fi

# 4) Миграции
run_migrations

# 5) Health
log "Проверка готовности сервисов"
wait_service_ready api 120 || true
wait_service_ready web 120 || true
if printf '%s\n' "${COMPOSE_ARGS[@]}" | grep -q "$REDIS_ADDON_FILE"; then
  wait_service_ready redis 120 || true
fi

log "Статус контейнеров:"
compose ps || true

log "Хвост логов API (60 строк):"
compose logs --tail=60 api || true

log "✅ Обновление завершено. SHA=${GITHUB_SHA}"
log "Полный лог: $LOG_FILE"
