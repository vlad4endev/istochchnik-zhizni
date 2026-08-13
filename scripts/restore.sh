#!/usr/bin/env bash
# Безопасное восстановление из бекапа, созданного scripts/backup.sh.
#
# НИКОГДА не затирает данные без явного подтверждения.
# По умолчанию — dry-run (только проверка). Для записи:
#   CONFIRM_RESTORE=YES bash scripts/restore.sh backups/istochnik-backup-YYYYMMDD-HHMMSS
#
# Опции (env):
#   CONFIRM_RESTORE=YES     — обязательно для реального восстановления
#   RESTORE_DB=1            — восстановить БД (по умолчанию 1 при CONFIRM)
#   RESTORE_UPLOADS=1       — восстановить uploads (по умолчанию 1)
#   RESTORE_SECRETS=0       — secrets по умолчанию выкл (опасно перезаписать ключи)
#   RESTORE_ENV=0           — расшифровать .env.full.enc → .env.restored (не перезаписывает .env)
#   RESTORE_DB_DANGEROUS_DROP=1 — DROP SCHEMA public CASCADE перед restore (иначе --clean в pg_restore)
#   BACKUP_ENCRYPT_PASSPHRASE=… — если бекап зашифрован
#   TARGET_UPLOADS_DIR=…    — куда распаковать uploads (по умолчанию uploads/ проекта)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/backup-common.sh"

backup_load_env "$ROOT"

BACKUPS_ROOT="${BACKUP_DIR:-$ROOT/backups}"
LOCK_FILE="${BACKUPS_ROOT}/.backup.lock"
PG_IMAGE="${BACKUP_PG_IMAGE:-postgres:16-alpine}"

usage() {
  cat <<'EOF'
Восстановление из полного бекапа.

  # Только проверка (безопасно):
  bash scripts/restore.sh backups/istochnik-backup-YYYYMMDD-HHMMSS

  # Реальное восстановление (ОСТОРОЖНО — перезапишет БД/uploads):
  CONFIRM_RESTORE=YES bash scripts/restore.sh backups/istochnik-backup-YYYYMMDD-HHMMSS

  # Только uploads:
  CONFIRM_RESTORE=YES RESTORE_DB=0 bash scripts/restore.sh …

  # Только БД:
  CONFIRM_RESTORE=YES RESTORE_UPLOADS=0 bash scripts/restore.sh …

Перед restore автоматически создаётся safety-бекап текущего состояния
(если не задано SKIP_SAFETY_BACKUP=1).
EOF
}

BACKUP_PATH="${1:-}"
if [[ -z "$BACKUP_PATH" || "$BACKUP_PATH" == "-h" || "$BACKUP_PATH" == "--help" || "$BACKUP_PATH" == "help" ]]; then
  usage
  exit 0
fi

[[ "$BACKUP_PATH" = /* ]] || BACKUP_PATH="$ROOT/$BACKUP_PATH"
[[ -d "$BACKUP_PATH" ]] || backup_die "Каталог бекапа не найден: $BACKUP_PATH"
[[ -f "$BACKUP_PATH/MANIFEST.txt" ]] || backup_die "Нет MANIFEST.txt — это не полный бекап проекта?"
[[ -f "$BACKUP_PATH/checksums.sha256" ]] || backup_die "Нет checksums.sha256"

mkdir -p "$BACKUPS_ROOT"
backup_acquire_lock "$LOCK_FILE"

DRY_RUN=1
if [[ "${CONFIRM_RESTORE:-}" == "YES" ]]; then
  DRY_RUN=0
fi

backup_log "Бекап: $BACKUP_PATH"
backup_log "Режим: $([[ "$DRY_RUN" -eq 1 ]] && echo 'DRY-RUN (только проверка)' || echo 'ЗАПИСЬ (CONFIRM_RESTORE=YES)')"
echo "----- MANIFEST -----"
cat "$BACKUP_PATH/MANIFEST.txt"
echo "--------------------"

backup_log "Проверка checksums…"
backup_verify_checksums "$BACKUP_PATH"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Расшифровка при необходимости
resolve_db_dump() {
  if [[ -f "$BACKUP_PATH/db.dump.gz" ]]; then
    echo "$BACKUP_PATH/db.dump.gz"
    return
  fi
  if [[ -f "$BACKUP_PATH/db.dump.gz.enc" ]]; then
    backup_decrypt_file "$BACKUP_PATH/db.dump.gz.enc" "$TMP_DIR/db.dump.gz"
    echo "$TMP_DIR/db.dump.gz"
    return
  fi
  backup_die "В бекапе нет db.dump.gz / db.dump.gz.enc"
}

resolve_secrets_archive() {
  if [[ -f "$BACKUP_PATH/secrets.tar.gz" ]]; then
    echo "$BACKUP_PATH/secrets.tar.gz"
    return
  fi
  if [[ -f "$BACKUP_PATH/secrets.tar.gz.enc" ]]; then
    backup_decrypt_file "$BACKUP_PATH/secrets.tar.gz.enc" "$TMP_DIR/secrets.tar.gz"
    echo "$TMP_DIR/secrets.tar.gz"
    return
  fi
  echo ""
}

DB_DUMP_GZ="$(resolve_db_dump)"
gzip -t "$DB_DUMP_GZ"
gunzip -c "$DB_DUMP_GZ" >"$TMP_DIR/db.dump"
# Проверка custom dump
magic="$(head -c 5 "$TMP_DIR/db.dump" | tr -d '\0' || true)"
[[ "$magic" == "PGDMP" ]] || backup_die "Дамп БД повреждён (нет PGDMP)"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore -l "$TMP_DIR/db.dump" >/dev/null
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$TMP_DIR:/dump:ro" "$PG_IMAGE" pg_restore -l /dump/db.dump >/dev/null
else
  backup_warn "pg_restore недоступен — расширенная проверка списка TOC пропущена"
fi
backup_log "Дамп БД: OK ($(du -h "$TMP_DIR/db.dump" | awk '{print $1}'))"

if [[ -f "$BACKUP_PATH/uploads.tar.gz" ]]; then
  gzip -t "$BACKUP_PATH/uploads.tar.gz"
  backup_log "uploads.tar.gz: OK"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  backup_log "✅ Dry-run успешен. Для восстановления:"
  echo "  CONFIRM_RESTORE=YES bash scripts/restore.sh $BACKUP_PATH"
  exit 0
fi

# ─── Реальное восстановление ────────────────────────────────────────────────

RESTORE_DB="${RESTORE_DB:-1}"
RESTORE_UPLOADS="${RESTORE_UPLOADS:-1}"
RESTORE_SECRETS="${RESTORE_SECRETS:-0}"
RESTORE_ENV="${RESTORE_ENV:-0}"

# Safety backup текущего состояния перед разрушительными действиями
if [[ "${SKIP_SAFETY_BACKUP:-0}" != "1" ]]; then
  backup_log "Создаю safety-бекап текущего состояния перед restore…"
  # Тот же flock уже удерживается restore — вложенный backup без повторного lock.
  BACKUP_DIR="$BACKUPS_ROOT" \
    BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}" \
    BACKUP_SKIP_LOCK=1 \
    bash "$ROOT/scripts/backup.sh" create || backup_die "Safety-бекап не удался — restore отменён"
  backup_log "Safety-бекап готов (см. $BACKUPS_ROOT/latest)"
fi

restore_db_compose() {
  local user="${POSTGRES_USER:-postgres}"
  local dbname="${POSTGRES_DB:-istochik_db}"
  backup_log "Восстановление БД через compose db…"

  if [[ "${RESTORE_DB_DANGEROUS_DROP:-0}" == "1" ]]; then
    backup_warn "DROP SCHEMA public CASCADE…"
    backup_compose exec -T db \
      psql -U "$user" -d "$dbname" -v ON_ERROR_STOP=1 \
      -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
  fi

  # pg_restore --clean --if-exists безопаснее полного DROP для большинства случаев
  backup_compose exec -T db \
    pg_restore -U "$user" -d "$dbname" --clean --if-exists --no-owner --no-acl \
    <"$TMP_DIR/db.dump" || {
      # pg_restore возвращает 1 при warnings — проверяем код
      local rc=$?
      if [[ "$rc" -gt 1 ]]; then
        backup_die "pg_restore завершился с кодом $rc"
      fi
      backup_warn "pg_restore вернул $rc (часто warnings) — проверьте логи"
    }
}

restore_db_url() {
  backup_parse_database_url "$DATABASE_URL"
  backup_log "Восстановление БД через $PG_IMAGE → ${BACKUP_DB_HOST}:${BACKUP_DB_PORT}/${BACKUP_DB_NAME}"

  local network_args=()
  local host="$BACKUP_DB_HOST"
  if [[ "$host" == "db" ]] && backup_db_container_running; then
    local net
    net="$(backup_compose ps -q db 2>/dev/null | head -n1 | xargs -I{} docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' {} 2>/dev/null | awk '{print $1}')"
    [[ -n "$net" ]] && network_args=(--network "$net")
  elif [[ "$host" == "localhost" || "$host" == "127.0.0.1" ]]; then
    host="host.docker.internal"
    network_args=(--add-host=host.docker.internal:host-gateway)
  fi

  local sslmode="${BACKUP_DB_SSLMODE:-prefer}"
  if [[ "${DB_SSL:-false}" == "true" || "${DB_SSL:-0}" == "1" ]]; then
    sslmode="${BACKUP_DB_SSLMODE:-require}"
  fi

  if [[ "${RESTORE_DB_DANGEROUS_DROP:-0}" == "1" ]]; then
    backup_warn "DROP SCHEMA public CASCADE (remote)…"
    docker run --rm "${network_args[@]}" \
      -e PGPASSWORD="$BACKUP_DB_PASSWORD" \
      -e PGSSLMODE="$sslmode" \
      "$PG_IMAGE" \
      psql -h "$host" -p "$BACKUP_DB_PORT" -U "$BACKUP_DB_USER" -d "$BACKUP_DB_NAME" -v ON_ERROR_STOP=1 \
      -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
  fi

  docker run --rm "${network_args[@]}" \
    -e PGPASSWORD="$BACKUP_DB_PASSWORD" \
    -e PGSSLMODE="$sslmode" \
    -v "$TMP_DIR:/dump:ro" \
    "$PG_IMAGE" \
    pg_restore -h "$host" -p "$BACKUP_DB_PORT" -U "$BACKUP_DB_USER" -d "$BACKUP_DB_NAME" \
      --clean --if-exists --no-owner --no-acl \
      /dump/db.dump || {
      local rc=$?
      if [[ "$rc" -gt 1 ]]; then
        backup_die "pg_restore (url) код $rc"
      fi
      backup_warn "pg_restore вернул $rc"
    }
}

restore_db_local() {
  [[ -n "${DATABASE_URL:-}" ]] || return 1
  command -v pg_restore >/dev/null 2>&1 || return 1
  backup_log "Восстановление БД через локальный pg_restore…"
  if [[ "${RESTORE_DB_DANGEROUS_DROP:-0}" == "1" ]]; then
    command -v psql >/dev/null 2>&1 || backup_die "psql нужен для DROP SCHEMA"
    backup_warn "DROP SCHEMA public CASCADE…"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
  fi
  pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" "$TMP_DIR/db.dump" || {
    local rc=$?
    if [[ "$rc" -gt 1 ]]; then
      backup_die "pg_restore (local) код $rc"
    fi
    backup_warn "pg_restore вернул $rc"
  }
}

if [[ "$RESTORE_DB" == "1" ]]; then
  backup_compose_args
  if backup_db_container_running; then
    restore_db_compose
  elif restore_db_local; then
    :
  elif command -v docker >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
    restore_db_url
  else
    backup_die "Нет способа pg_restore: compose db, локальный pg_restore+DATABASE_URL или Docker"
  fi
  backup_log "БД восстановлена"
else
  backup_log "RESTORE_DB=0 — БД не трогаю"
fi

if [[ "$RESTORE_UPLOADS" == "1" && -f "$BACKUP_PATH/uploads.tar.gz" ]]; then
  local_uploads="${TARGET_UPLOADS_DIR:-$(backup_resolve_uploads_dir "$ROOT")}"
  mkdir -p "$(dirname "$local_uploads")"
  # Безопасная распаковка: сначала во временный каталог, потом atomic swap
  stage="$TMP_DIR/uploads_stage"
  mkdir -p "$stage"
  tar -xzf "$BACKUP_PATH/uploads.tar.gz" -C "$stage"
  # Архив содержит каталог uploads/ или содержимое — нормализуем
  extracted=""
  if [[ -d "$stage/uploads" ]]; then
    extracted="$stage/uploads"
  else
    extracted="$stage"
  fi
  if [[ -d "$local_uploads" ]]; then
    bak="${local_uploads}.pre-restore-$(date +%Y%m%d-%H%M%S)"
    backup_log "Текущие uploads → $bak"
    mv "$local_uploads" "$bak"
  fi
  mkdir -p "$(dirname "$local_uploads")"
  mv "$extracted" "$local_uploads"
  backup_log "uploads восстановлены → $local_uploads"
else
  backup_log "uploads: пропуск"
fi

if [[ "$RESTORE_SECRETS" == "1" ]]; then
  sec="$(resolve_secrets_archive)"
  if [[ -n "$sec" ]]; then
    bak_sec="$ROOT/secrets.pre-restore-$(date +%Y%m%d-%H%M%S)"
    if [[ -d "$ROOT/secrets" ]]; then
      mv "$ROOT/secrets" "$bak_sec"
      backup_log "Текущие secrets → $bak_sec"
    fi
    tar -xzf "$sec" -C "$ROOT"
    backup_log "secrets восстановлены"
  else
    backup_warn "В бекапе нет secrets"
  fi
fi

if [[ "$RESTORE_ENV" == "1" && -f "$BACKUP_PATH/env.full.enc" ]]; then
  backup_decrypt_file "$BACKUP_PATH/env.full.enc" "$ROOT/.env.restored"
  chmod 600 "$ROOT/.env.restored"
  backup_log "Расшифрован .env → $ROOT/.env.restored (оригинал .env НЕ перезаписан)"
  backup_log "Сверьте и при необходимости: mv .env.restored .env"
fi

backup_log "✅ Восстановление завершено из $BACKUP_PATH"
backup_log "Перезапустите API/web: npm run server:update или docker compose up -d"
