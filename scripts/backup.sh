#!/usr/bin/env bash
# Полный безопасный бекап проекта «Источник жизни»:
#   - PostgreSQL (pg_dump custom format + gzip)
#   - локальные uploads (legacy-файлы)
#   - secrets/ (опционально, с шифрованием если задан BACKUP_ENCRYPT_PASSPHRASE)
#   - снимок .env без секретных значений (имена ключей) + опционально зашифрованный .env
#   - MANIFEST + SHA256 checksums + проверка целостности
#
# Запуск из корня репозитория:
#   bash scripts/backup.sh
#   npm run backup
#   bash scripts/backup.sh list
#   bash scripts/backup.sh verify backups/istochnik-backup-YYYYMMDD-HHMMSS
#
# Переменные:
#   BACKUP_DIR=./backups          — каталог хранения
#   BACKUP_KEEP_DAYS=14           — удалять старше N дней
#   BACKUP_KEEP_COUNT=14          — хранить не больше N копий
#   BACKUP_INCLUDE_SECRETS=1      — включить secrets/ (по умолчанию 1)
#   BACKUP_INCLUDE_ENV=1          — зашифровать полный .env (нужен BACKUP_ENCRYPT_PASSPHRASE)
#   BACKUP_ENCRYPT_PASSPHRASE=…   — AES-256 шифрование чувствительных частей
#   BACKUP_SKIP_UPLOADS=1         — не архивировать uploads
#   BACKUP_SKIP_DB=1              — не дампить БД (не рекомендуется)
#   UPDATE_COMPOSE_FILES / COMPOSE_FILE — как в server-update.sh
#   DATABASE_URL                  — из .env; для remote/Supabase
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
Полный бекап БД + uploads (+ secrets/env при необходимости).

  bash scripts/backup.sh              создать бекап
  bash scripts/backup.sh list         список бекапов
  bash scripts/backup.sh verify DIR   проверить checksums и gzip
  bash scripts/backup.sh help

Переменные: BACKUP_DIR, BACKUP_KEEP_DAYS, BACKUP_KEEP_COUNT,
  BACKUP_ENCRYPT_PASSPHRASE, BACKUP_INCLUDE_SECRETS, BACKUP_INCLUDE_ENV,
  BACKUP_SKIP_UPLOADS, BACKUP_SKIP_DB, DATABASE_URL, COMPOSE_FILE.
EOF
}

cmd_list() {
  mkdir -p "$BACKUPS_ROOT"
  local found=0
  local d
  while IFS= read -r -d '' d; do
    found=1
    local size manifest_ok="?"
    size="$(du -sh "$d" 2>/dev/null | awk '{print $1}')"
    if [[ -f "$d/MANIFEST.txt" ]]; then
      manifest_ok="ok"
    else
      manifest_ok="NO_MANIFEST"
    fi
    printf '%s\t%s\t%s\n' "$(basename "$d")" "$size" "$manifest_ok"
  done < <(find "$BACKUPS_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'istochnik-backup-*' -print0 | sort -z)
  if [[ "$found" -eq 0 ]]; then
    echo "(пусто) — бекапов ещё нет в $BACKUPS_ROOT"
  fi
}

cmd_verify() {
  local dir="${1:-}"
  [[ -n "$dir" ]] || backup_die "Укажите каталог бекапа"
  [[ "$dir" = /* ]] || dir="$ROOT/$dir"
  [[ -d "$dir" ]] || backup_die "Нет каталога: $dir"

  backup_log "Проверка checksums…"
  backup_verify_checksums "$dir"

  if [[ -f "$dir/db.dump.gz" ]]; then
    backup_log "Проверка gzip db.dump.gz…"
    gzip -t "$dir/db.dump.gz"
  elif [[ -f "$dir/db.dump.gz.enc" ]]; then
    backup_log "db.dump.gz.enc — проверка расшифровки пропущена (нужен passphrase при restore)"
  else
    backup_warn "Нет db.dump.gz в бекапе"
  fi

  if [[ -f "$dir/uploads.tar.gz" ]]; then
    backup_log "Проверка gzip uploads.tar.gz…"
    gzip -t "$dir/uploads.tar.gz"
  fi

  if [[ -f "$dir/MANIFEST.txt" ]]; then
    backup_log "MANIFEST:"
    cat "$dir/MANIFEST.txt"
  fi
  backup_log "✅ Бекап целостен: $dir"
}

# Дамп через docker compose exec db (локальный Postgres в стеке).
dump_via_compose_db() {
  local out_raw="${1:?}"
  local user="${POSTGRES_USER:-postgres}"
  local dbname="${POSTGRES_DB:-istochik_db}"
  backup_log "pg_dump через compose service db (user=$user db=$dbname)"
  backup_compose exec -T db \
    pg_dump -U "$user" -d "$dbname" -Fc --no-owner --no-acl \
    >"$out_raw"
}

# Дамп через временный контейнер postgres:16 по DATABASE_URL (Supabase / remote / host).
dump_via_database_url() {
  local out_raw="${1:?}"
  [[ -n "${DATABASE_URL:-}" ]] || backup_die "DATABASE_URL пуст"

  backup_parse_database_url "$DATABASE_URL"
  backup_log "pg_dump через $PG_IMAGE → ${BACKUP_DB_HOST}:${BACKUP_DB_PORT}/${BACKUP_DB_NAME} (user=${BACKUP_DB_USER})"

  local network_args=()
  # Если хост — имя docker-сервиса db, подключаемся к сети compose.
  if [[ "$BACKUP_DB_HOST" == "db" ]] && backup_db_container_running; then
    local net
    net="$(backup_compose ps -q db 2>/dev/null | head -n1 | xargs -I{} docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' {} 2>/dev/null | awk '{print $1}')"
    if [[ -n "$net" ]]; then
      network_args=(--network "$net")
    fi
  elif [[ "$BACKUP_DB_HOST" == "localhost" || "$BACKUP_DB_HOST" == "127.0.0.1" ]]; then
    # С хоста localhost виден контейнеру через host-gateway
    BACKUP_DB_HOST="host.docker.internal"
    network_args=(--add-host=host.docker.internal:host-gateway)
  fi

  local sslmode="${BACKUP_DB_SSLMODE:-}"
  if [[ -z "$sslmode" ]]; then
    if [[ "${DB_SSL:-false}" == "true" || "${DB_SSL:-0}" == "1" ]]; then
      sslmode="require"
    else
      sslmode="prefer"
    fi
  fi

  # Не печатаем пароль в argv через env внутри контейнера.
  docker run --rm \
    "${network_args[@]}" \
    -e PGPASSWORD="$BACKUP_DB_PASSWORD" \
    -e PGSSLMODE="$sslmode" \
    "$PG_IMAGE" \
    pg_dump \
      -h "$BACKUP_DB_HOST" \
      -p "$BACKUP_DB_PORT" \
      -U "$BACKUP_DB_USER" \
      -d "$BACKUP_DB_NAME" \
      -Fc --no-owner --no-acl \
    >"$out_raw"
}

# Дамп через локальный pg_dump (если установлен на хосте).
dump_via_local_pg_dump() {
  local out_raw="${1:?}"
  command -v pg_dump >/dev/null 2>&1 || return 1
  [[ -n "${DATABASE_URL:-}" ]] || return 1
  backup_log "pg_dump локально по DATABASE_URL"
  # pg_dump понимает connection URI напрямую
  pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl >"$out_raw"
}

dump_database() {
  local dest_gz="${1:?}"
  local raw="${dest_gz%.gz}.partial"
  rm -f "$raw" "$dest_gz"

  if [[ "${BACKUP_SKIP_DB:-0}" == "1" ]]; then
    backup_warn "BACKUP_SKIP_DB=1 — пропускаю дамп БД"
    return 0
  fi

  local dumped=0
  if backup_db_container_running; then
    dump_via_compose_db "$raw"
    dumped=1
  elif dump_via_local_pg_dump "$raw"; then
    dumped=1
  elif command -v docker >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
    dump_via_database_url "$raw"
    dumped=1
  else
    backup_die "Нет способа сделать pg_dump: нужен compose db, локальный pg_dump+DATABASE_URL или Docker+$PG_IMAGE"
  fi

  [[ "$dumped" -eq 1 ]] || backup_die "Дамп БД не выполнен"
  [[ -s "$raw" ]] || backup_die "Пустой дамп БД — прерываю (данные не сохранены)"

  # Проверка: custom-format dump начинается с PG DMP
  local magic
  magic="$(head -c 5 "$raw" | tr -d '\0' || true)"
  if [[ "$magic" != "PGDMP" ]]; then
    backup_die "Дамп БД не похож на pg_dump -Fc (ожидался заголовок PGDMP). Файл: $raw"
  fi

  # Доп. проверка через pg_restore --list
  if command -v pg_restore >/dev/null 2>&1; then
    if pg_restore -l "$raw" >/dev/null; then
      backup_log "pg_restore --list: OK (local)"
    else
      backup_die "pg_restore --list не прошёл — бекап БД бракованный"
    fi
  elif command -v docker >/dev/null 2>&1; then
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    cp "$raw" "$tmp_dir/dump"
    if docker run --rm -v "$tmp_dir:/dump:ro" "$PG_IMAGE" pg_restore -l /dump/dump >/dev/null; then
      backup_log "pg_restore --list: OK"
      rm -rf "$tmp_dir"
    else
      rm -rf "$tmp_dir"
      backup_die "pg_restore --list не прошёл — бекап БД бракованный"
    fi
  else
    backup_warn "pg_restore недоступен — пропущена расширенная проверка дампа (заголовок PGDMP есть)"
  fi

  gzip -c "$raw" >"${dest_gz}.partial"
  rm -f "$raw"
  backup_atomic_mv "${dest_gz}.partial" "$dest_gz"
  backup_log "БД: $(du -h "$dest_gz" | awk '{print $1}') → $(basename "$dest_gz")"

  if [[ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]]; then
    backup_log "Шифрую db.dump.gz…"
    backup_encrypt_file "$dest_gz" "${dest_gz}.enc"
  fi
}

archive_uploads() {
  local dest="${1:?}"
  if [[ "${BACKUP_SKIP_UPLOADS:-0}" == "1" ]]; then
    backup_warn "BACKUP_SKIP_UPLOADS=1 — пропускаю uploads"
    return 0
  fi

  local uploads
  uploads="$(backup_resolve_uploads_dir "$ROOT")"
  if [[ ! -d "$uploads" ]]; then
    backup_warn "Каталог uploads не найден ($uploads) — пропускаю"
    printf 'uploads_skipped=missing\n' >>"$WORK_DIR/notes.txt"
    return 0
  fi

  local count
  count="$(find "$uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$count" == "0" ]]; then
    backup_log "uploads пуст — создаю пустой архив-маркер"
    tar -czf "${dest}.partial" -C "$(dirname "$uploads")" --files-from /dev/null
    backup_atomic_mv "${dest}.partial" "$dest"
    printf 'uploads_files=0\n' >>"$WORK_DIR/notes.txt"
    return 0
  fi

  backup_log "Архивирую uploads ($count файлов): $uploads"
  # Стабильный порядок + относительно parent, чтобы restore положил в uploads/
  tar -czf "${dest}.partial" -C "$(dirname "$uploads")" "$(basename "$uploads")"
  backup_atomic_mv "${dest}.partial" "$dest"
  printf 'uploads_files=%s\n' "$count" >>"$WORK_DIR/notes.txt"
  backup_log "uploads: $(du -h "$dest" | awk '{print $1}')"
}

archive_secrets() {
  local dest="${1:?}"
  if [[ "${BACKUP_INCLUDE_SECRETS:-1}" != "1" ]]; then
    backup_log "secrets пропущены (BACKUP_INCLUDE_SECRETS≠1)"
    return 0
  fi
  if [[ ! -d "$ROOT/secrets" ]]; then
    backup_warn "нет каталога secrets/"
    return 0
  fi
  local n
  n="$(find "$ROOT/secrets" -type f ! -name '.gitkeep' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$n" == "0" ]]; then
    backup_log "secrets/ пуст"
    return 0
  fi
  backup_log "Архивирую secrets/ ($n файлов)"
  tar -czf "${dest}.partial" -C "$ROOT" secrets
  backup_atomic_mv "${dest}.partial" "$dest"
  if [[ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]]; then
    backup_encrypt_file "$dest" "${dest}.enc"
  else
    backup_warn "secrets сохранены БЕЗ шифрования. Задайте BACKUP_ENCRYPT_PASSPHRASE для AES-256."
  fi
}

snapshot_env() {
  # Всегда: список ключей без значений (безопасно для логов/облака).
  local keys_file="$WORK_DIR/env.keys.txt"
  if [[ -f "$ROOT/.env" ]]; then
    grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT/.env" | cut -d= -f1 | sort -u >"$keys_file" || true
  else
    echo "(нет .env)" >"$keys_file"
  fi

  if [[ "${BACKUP_INCLUDE_ENV:-0}" == "1" ]]; then
    [[ -f "$ROOT/.env" ]] || backup_die "BACKUP_INCLUDE_ENV=1, но .env нет"
    [[ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]] || backup_die "BACKUP_INCLUDE_ENV=1 требует BACKUP_ENCRYPT_PASSPHRASE"
    backup_log "Шифрую полный .env…"
    cp "$ROOT/.env" "$WORK_DIR/env.full.partial"
    backup_encrypt_file "$WORK_DIR/env.full.partial" "$WORK_DIR/env.full.enc"
  fi
}

write_manifest() {
  local stamp="${1:?}"
  local git_sha
  git_sha="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  local host
  host="$(hostname 2>/dev/null || echo unknown)"
  local db_hint="${BACKUP_DB_HOST:-}"
  if [[ -z "$db_hint" && -n "${DATABASE_URL:-}" ]]; then
    backup_parse_database_url "$DATABASE_URL" 2>/dev/null || true
    db_hint="${BACKUP_DB_HOST:-unknown}"
  fi
  [[ -n "$db_hint" ]] || db_hint="unknown"

  {
    echo "project=istochnik-zhizni"
    echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "local_time=$(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "stamp=$stamp"
    echo "hostname=$host"
    echo "git_sha=$git_sha"
    echo "pg_image=$PG_IMAGE"
    echo "db_included=$([[ -f $WORK_DIR/db.dump.gz || -f $WORK_DIR/db.dump.gz.enc ]] && echo yes || echo no)"
    echo "uploads_included=$([[ -f $WORK_DIR/uploads.tar.gz ]] && echo yes || echo no)"
    echo "secrets_included=$([[ -f $WORK_DIR/secrets.tar.gz || -f $WORK_DIR/secrets.tar.gz.enc ]] && echo yes || echo no)"
    echo "env_full_encrypted=$([[ -f $WORK_DIR/env.full.enc ]] && echo yes || echo no)"
    echo "encrypted=$([[ -n ${BACKUP_ENCRYPT_PASSPHRASE:-} ]] && echo yes || echo no)"
    echo "database_host_hint=$db_hint"
    echo "restore=bash scripts/restore.sh $BACKUPS_ROOT/istochnik-backup-$stamp"
    if [[ -f "$WORK_DIR/notes.txt" ]]; then
      echo "--- notes ---"
      cat "$WORK_DIR/notes.txt"
    fi
  } >"$WORK_DIR/MANIFEST.txt"
}

cmd_create() {
  mkdir -p "$BACKUPS_ROOT"
  backup_acquire_lock "$LOCK_FILE"

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local final_dir="$BACKUPS_ROOT/istochnik-backup-$stamp"
  WORK_DIR="$BACKUPS_ROOT/.partial-$stamp"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"
  : >"$WORK_DIR/notes.txt"

  backup_log "Старт бекапа → $final_dir (частичный: $WORK_DIR)"

  # БД
  dump_database "$WORK_DIR/db.dump.gz"

  # Uploads
  archive_uploads "$WORK_DIR/uploads.tar.gz"

  # Secrets
  archive_secrets "$WORK_DIR/secrets.tar.gz"

  # Env keys / optional encrypted env
  snapshot_env

  write_manifest "$stamp"

  backup_log "Считаю SHA256…"
  backup_write_checksums "$WORK_DIR"

  # Финальная проверка до атомарного rename
  backup_verify_checksums "$WORK_DIR"
  if [[ -f "$WORK_DIR/db.dump.gz" ]]; then
    gzip -t "$WORK_DIR/db.dump.gz"
  fi

  # Атомарно публикуем каталог (rename в пределах одной FS)
  if [[ -e "$final_dir" ]]; then
    backup_die "Целевой каталог уже существует: $final_dir"
  fi
  backup_atomic_mv "$WORK_DIR" "$final_dir"
  WORK_DIR=""

  # Симлинк на последний успешный
  ln -sfn "$(basename "$final_dir")" "$BACKUPS_ROOT/latest"

  backup_apply_retention "$BACKUPS_ROOT"

  backup_log "✅ Бекап готов: $final_dir"
  backup_log "Проверка: bash scripts/backup.sh verify $final_dir"
  backup_log "Восстановление: bash scripts/restore.sh $final_dir"
  du -sh "$final_dir" || true
  cat "$final_dir/MANIFEST.txt"
}

# ─── main ───────────────────────────────────────────────────────────────────

case "${1:-create}" in
  help|-h|--help)
    usage
    ;;
  list)
    cmd_list
    ;;
  verify)
    shift || true
    cmd_verify "${1:-}"
    ;;
  create|"")
    cmd_create
    ;;
  *)
    usage
    backup_die "Неизвестная команда: $1"
    ;;
esac
