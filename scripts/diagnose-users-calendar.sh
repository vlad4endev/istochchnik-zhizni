#!/usr/bin/env bash
# Диагностика: админ-список участников и молитвенный план недели.
# Запускать на VPS из корня клона: bash scripts/diagnose-users-calendar.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.overlay.yml)
WEB_PORT="${WEB_PORT:-8080}"
PUBLIC_ORIGIN="${PUBLIC_WEB_ORIGIN:-https://app.church-tambov.ru}"

log() { printf '[diagnose-users-calendar] %s\n' "$*"; }

log "Контейнеры:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'istochnik|NAMES' || true

log "Хвост логов API (ошибки users/calendar):"
docker logs istochnik-api 2>&1 | tail -120 | grep -iE 'Failed to fetch users|Calendar next-week|Database error|ECONN|timeout|crash|Unhandled|error' || log "(нет совпадений в хвосте)"

log "Локально через web:${WEB_PORT}:"
for path in \
  "/health" \
  "/api/users" \
  "/api/users/prayer-cycle/roster?date=$(date -u +%F)" \
  "/api/calendar/next-week/members?week=current" \
  "/api/calendar/$(date -u +%F)"
do
  code="$(curl -sS -o /tmp/diag-body.txt -w '%{http_code}' --max-time 30 "http://127.0.0.1:${WEB_PORT}${path}" || echo 000)"
  ms="$(curl -sS -o /dev/null -w '%{time_total}' --max-time 30 "http://127.0.0.1:${WEB_PORT}${path}" 2>/dev/null || echo '?')"
  body="$(head -c 120 /tmp/diag-body.txt 2>/dev/null | tr '\n' ' ')"
  log "  ${path} → HTTP ${code} (${ms}s) ${body}"
done

log "Публично ${PUBLIC_ORIGIN}:"
for path in "/health" "/api/users" "/api/calendar/next-week/members?week=current"; do
  code="$(curl -sS -o /tmp/diag-body.txt -w '%{http_code}' --max-time 30 "${PUBLIC_ORIGIN}${path}" || echo 000)"
  log "  ${path} → HTTP ${code} $(head -c 80 /tmp/diag-body.txt 2>/dev/null | tr '\n' ' ')"
done

log "SQL: число участников и строк mpc (если БД доступна):"
DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'istochchnik-zhizni-db|istochnik.*db' | head -1 || true)"
if [[ -n "$DB_CONTAINER" ]]; then
  docker exec "$DB_CONTAINER" psql -U "${POSTGRES_USER:-vladislav4endev}" -d "${POSTGRES_DB:-istochik_db}" -c \
    "SELECT
       (SELECT COUNT(*) FROM members) AS members,
       (SELECT COUNT(*) FROM members WHERE is_active AND in_prayer_cycle) AS in_cycle,
       (SELECT COUNT(*) FROM member_prayer_by_cycle) AS mpc_rows;" \
    2>/dev/null || log "  (psql не удалось — проверьте POSTGRES_USER/DB)"
  log "EXPLAIN listUsers-подобный LATERAL (первые 5):"
  docker exec "$DB_CONTAINER" psql -U "${POSTGRES_USER:-vladislav4endev}" -d "${POSTGRES_DB:-istochik_db}" -c \
    "EXPLAIN (ANALYZE, BUFFERS)
     SELECT m.id, mpc_pick.prayer_request
     FROM members m
     LEFT JOIN LATERAL (
       SELECT NULLIF(TRIM(mpc_sel.prayer_request), '') AS prayer_request
       FROM member_prayer_by_cycle mpc_sel
       WHERE mpc_sel.member_id = m.id
         AND mpc_sel.cycle_index BETWEEN 0 AND 2
         AND NULLIF(TRIM(mpc_sel.prayer_request), '') IS NOT NULL
       ORDER BY mpc_sel.cycle_index, mpc_sel.updated_at DESC
       LIMIT 1
     ) mpc_pick ON TRUE
     ORDER BY m.id DESC;" 2>/dev/null | head -40 || true
else
  log "  контейнер БД не найден"
fi

log "Если UI пишет Network Error при живом API:"
log "  1) Hard refresh (Ctrl+Shift+R) — сброс старого SW с NetworkFirst@15s"
log "  2) docker logs -f istochnik-api во время открытия Админка → Пользователи"
log "  3) npm run server:update  (подтянуть фикс SW + LATERAL listUsers)"
log "Готово."
