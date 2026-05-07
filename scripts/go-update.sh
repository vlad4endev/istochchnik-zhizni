#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PODCAST_PAGE="web-react/src/features/resources/pages/PodcastsPage.tsx"
REDIS_ADDON_FILE="docker-compose.redis-addon.yml"

log() {
  echo "[go:update] $*"
}

env_flag_true() {
  local key="$1"
  local val="${!key:-}"
  if [[ -n "$val" ]]; then
    [[ "$val" == "true" ]]
    return
  fi
  if [[ -f ".env" ]]; then
    val="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | tr -d '"'\''[:space:]')"
    [[ "$val" == "true" ]]
    return
  fi
  return 1
}

wait_service_healthy() {
  local service="$1"
  local timeout="${2:-90}"
  local started_at
  started_at="$(date +%s)"
  local container_id
  container_id="$(docker compose "${COMPOSE_ARGS[@]}" ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    log "Сервис '$service' не найден в compose."
    return 1
  fi

  while true; do
    local now elapsed status
    now="$(date +%s)"
    elapsed=$((now - started_at))
    if (( elapsed > timeout )); then
      log "Таймаут ожидания health для '$service' (${timeout}s)."
      docker compose "${COMPOSE_ARGS[@]}" ps
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

log "Восстанавливаю локальный файл перед pull (если есть): $PODCAST_PAGE"
if [[ -f "$PODCAST_PAGE" ]]; then
  git restore "$PODCAST_PAGE"
fi

log "Обновляю репозиторий fast-forward only"
git pull --ff-only

COMPOSE_ARGS=(-f docker-compose.yml)
if [[ -f "$REDIS_ADDON_FILE" ]] && env_flag_true "REDIS_REALTIME_ENABLED"; then
  COMPOSE_ARGS+=(-f "$REDIS_ADDON_FILE")
  log "Redis включен: добавляю overlay $REDIS_ADDON_FILE"
fi

log "Пересобираю и перезапускаю сервисы"
docker compose "${COMPOSE_ARGS[@]}" up -d --build --force-recreate

log "Выполняю initDb внутри API-контейнера"
docker compose "${COMPOSE_ARGS[@]}" exec -T api node dist/cli/runInitDb.js

log "Ожидаю готовность сервисов"
wait_service_healthy api 120
wait_service_healthy web 120
if printf '%s\n' "${COMPOSE_ARGS[@]}" | grep -q "$REDIS_ADDON_FILE"; then
  wait_service_healthy redis 120
fi

log "Итоговый статус контейнеров"
docker compose "${COMPOSE_ARGS[@]}" ps

log "Проверяю ключевые env внутри API"
docker compose "${COMPOSE_ARGS[@]}" exec -T api sh -lc 'env | grep -E "SKIP_DB_INIT_ON_START|REDIS_REALTIME_ENABLED|REDIS_URL" || true'

log "Хвост логов API (80 строк)"
docker compose "${COMPOSE_ARGS[@]}" logs --tail=80 api

log "Готово"
