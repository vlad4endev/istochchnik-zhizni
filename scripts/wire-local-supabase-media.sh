#!/usr/bin/env bash
# Подключает self-hosted Supabase Storage (Kong) к API/web для медиа мессенджера и ленты.
# Запускать на VPS из корня клона: bash scripts/wire-local-supabase-media.sh
#
# Шаги: найти SERVICE_ROLE_KEY → обновить .env → сеть Docker → recreate api/web → проверки.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.overlay.yml)
PUBLIC_ORIGIN="${PUBLIC_WEB_ORIGIN:-https://app.church-tambov.ru}"
WEB_PORT="${WEB_PORT:-8080}"
REBUILD_WEB="${REBUILD_WEB:-1}"

log() { printf '[wire-supabase-media] %s\n' "$*"; }
die() { printf '[wire-supabase-media] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die "Нет .env — сначала cp .env.example .env и задайте DATABASE_URL"

# --- 1) SERVICE_ROLE_KEY ---
find_service_role_key() {
  if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "$SUPABASE_SERVICE_ROLE_KEY"
    return 0
  fi
  local from_env
  from_env="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [[ -n "$from_env" && "$from_env" != "..." ]]; then
    echo "$from_env"
    return 0
  fi

  local candidate dir
  for dir in \
    "$ROOT/../supabase" \
    "$ROOT/../../supabase" \
    "$HOME/supabase" \
    "$HOME/docker/supabase" \
    /opt/supabase \
    /var/www/supabase
  do
    if [[ -f "$dir/.env" ]]; then
      candidate="$(grep -E '^SERVICE_ROLE_KEY=' "$dir/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
      if [[ -n "$candidate" ]]; then
        echo "$candidate"
        return 0
      fi
    fi
  done

  # Kong / studio env (часто JWT лежит как SUPABASE_SERVICE_KEY или SERVICE_ROLE_KEY)
  local cid
  for cid in supabase-kong supabase-studio supabase-auth; do
    if docker inspect "$cid" >/dev/null 2>&1; then
      candidate="$(docker inspect "$cid" --format '{{range .Config.Env}}{{println .}}{{end}}' \
        | grep -E '^(SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET)=' \
        | head -1 || true)"
      if [[ "$candidate" == SERVICE_ROLE_KEY=* || "$candidate" == SUPABASE_SERVICE_ROLE_KEY=* ]]; then
        echo "${candidate#*=}"
        return 0
      fi
    fi
  done

  return 1
}

log "Ищем SERVICE_ROLE_KEY…"
SERVICE_ROLE_KEY="$(find_service_role_key)" || true
if [[ -z "${SERVICE_ROLE_KEY:-}" ]]; then
  die "Не найден SERVICE_ROLE_KEY. Задайте вручную:
  export SUPABASE_SERVICE_ROLE_KEY='eyJ…'
  или добавьте в .env стека Supabase SERVICE_ROLE_KEY=…
  затем снова: bash scripts/wire-local-supabase-media.sh"
fi
log "SERVICE_ROLE_KEY найден (длина ${#SERVICE_ROLE_KEY})"

# --- SUPABASE_URL: предпочитаем Docker DNS в сети supabase_default ---
resolve_supabase_url() {
  if [[ -n "${SUPABASE_URL_OVERRIDE:-}" ]]; then
    echo "$SUPABASE_URL_OVERRIDE"
    return 0
  fi
  if docker inspect supabase-kong >/dev/null 2>&1; then
    # Внутренний порт Kong в compose Supabase обычно 8000
    if docker network inspect supabase_default >/dev/null 2>&1; then
      echo "http://supabase-kong:8000"
      return 0
    fi
  fi
  echo "http://172.17.0.1:8085"
}

SUPABASE_URL="$(resolve_supabase_url)"
log "SUPABASE_URL=$SUPABASE_URL"

LEGACY_ORIGINS="http://172.17.0.1:8085,http://127.0.0.1:8085,http://localhost:8085"
# Добавим типичный LAN из hostname -I
if command -v hostname >/dev/null 2>&1; then
  while read -r ip; do
    [[ "$ip" =~ ^192\.168\. ]] || [[ "$ip" =~ ^10\. ]] || continue
    LEGACY_ORIGINS="${LEGACY_ORIGINS},http://${ip}:8085"
  done < <(hostname -I 2>/dev/null | tr ' ' '\n' || true)
fi

# --- 2) Запись .env ---
upsert_env() {
  local key="$1" value="$2"
  local tmp
  tmp="$(mktemp)"
  if grep -qE "^${key}=" .env 2>/dev/null; then
    # не используем sed с произвольным value (спецсимволы JWT)
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ "^" k "=" { print k "=" v; done=1; next }
      { print }
      END { if (!done) print k "=" v }
    ' .env >"$tmp"
    mv "$tmp" .env
  else
    printf '%s=%s\n' "$key" "$value" >>"$ROOT/.env"
    rm -f "$tmp"
  fi
}

log "Обновляем .env…"
upsert_env SUPABASE_URL "$SUPABASE_URL"
upsert_env SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
upsert_env PUBLIC_WEB_ORIGIN "$PUBLIC_ORIGIN"
upsert_env SUPABASE_STORAGE_PUBLIC_URL "$PUBLIC_ORIGIN"
upsert_env VITE_PWA_ORIGIN "$PUBLIC_ORIGIN"
upsert_env VITE_SUPABASE_STORAGE_PUBLIC_URL "$PUBLIC_ORIGIN"
upsert_env SUPABASE_STORAGE_LEGACY_ORIGINS "$LEGACY_ORIGINS"
upsert_env TRUST_PROXY true

# --- сеть ---
if docker network inspect supabase_default >/dev/null 2>&1; then
  log "Подключаем istochnik-api к supabase_default (если ещё нет)…"
  docker network connect supabase_default istochnik-api 2>/dev/null || true
  docker network connect supabase_default istochnik-web 2>/dev/null || true
else
  log "WARN: сеть supabase_default не найдена — API будет ходить на 172.17.0.1:8085"
  upsert_env SUPABASE_URL "http://172.17.0.1:8085"
fi

# --- 3) recreate ---
log "Пересоздаём api…"
"${COMPOSE[@]}" up -d --force-recreate --no-deps api

if [[ "$REBUILD_WEB" == "1" ]]; then
  log "Пересобираем web (VITE_SUPABASE_STORAGE_PUBLIC_URL)…"
  "${COMPOSE[@]}" up -d --build --force-recreate --no-deps web
else
  log "REBUILD_WEB=0 — web не пересобираем"
fi

sleep 4

# --- 4) напоминание про NPM ---
log "NPM: Proxy Host → 172.17.0.1:${WEB_PORT}, Custom Locations пустые (без /api /uploads /sw.js)."

# --- 5) проверки ---
log "Проверки…"
if docker logs istochnik-api 2>&1 | tail -80 | grep -q 'Supabase Storage не настроен'; then
  log "WARN: в логах API всё ещё «Supabase Storage не настроен» — проверьте ключ и SUPABASE_URL"
else
  log "OK: предупреждения Supabase Storage в хвосте логов нет"
fi

code_storage="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 \
  "http://127.0.0.1:${WEB_PORT}/storage/v1/version" 2>/dev/null || echo 000)"
log "GET /storage/v1/version via web:${WEB_PORT} → HTTP ${code_storage} (ожидаем 200/401/404 от Kong, не HTML SPA)"

code_uploads="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 \
  "http://127.0.0.1:${WEB_PORT}/uploads/" 2>/dev/null || echo 000)"
log "GET /uploads/ → HTTP ${code_uploads}"

if [[ -d uploads ]] && [[ -n "$(ls -A uploads 2>/dev/null || true)" ]]; then
  log "OK: каталог uploads/ не пуст"
else
  log "WARN: uploads/ пуст — legacy /uploads/... ссылки будут 404. Нужен restore uploads.tar.gz из бекапа:"
  log "  CONFIRM_RESTORE=YES RESTORE_DB=0 RESTORE_SECRETS=0 bash scripts/restore.sh backups/<stamp>"
fi

# Пинг Kong с API-контейнера
if docker exec istochnik-api wget -qO- --timeout=5 "${SUPABASE_URL%/}/storage/v1/version" >/dev/null 2>&1 \
  || docker exec istochnik-api node -e "fetch(process.env.SUPABASE_URL+'/storage/v1/version').then(r=>process.exit(r.ok||r.status<500?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
  log "OK: API-контейнер достучался до Storage API"
else
  log "WARN: из api нет ответа Storage — проверьте сеть и SUPABASE_URL=$SUPABASE_URL"
fi

# Пример URL из БД (best-effort)
DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'istochchnik-zhizni-db|istochnik.*db' | head -1 || true)"
if [[ -n "$DB_CONTAINER" ]]; then
  log "Примеры URL вложений из БД (если таблица есть):"
  docker exec "$DB_CONTAINER" psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-istochik_db}" -tAc \
    "SELECT COALESCE(payload->>'url', payload->'attachments'->0->>'url') FROM messenger_messages WHERE payload IS NOT NULL LIMIT 5;" \
    2>/dev/null | sed 's/^/  /' || log "  (не удалось прочитать messenger_messages)"
fi

log "Готово. Проверьте https://app.church-tambov.ru/ мессенджер и ленту."
log "Если фото всё ещё недоступны — откройте DevTools → Network на битый URL и сверьте с /storage/v1 или /uploads."
