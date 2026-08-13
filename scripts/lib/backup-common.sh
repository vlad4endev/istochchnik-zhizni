#!/usr/bin/env bash
# Общие хелперы для scripts/backup.sh и scripts/restore.sh.
# Не запускать напрямую.

set -euo pipefail

backup_log() {
  echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

backup_die() {
  echo "[backup] ERROR: $*" >&2
  exit 1
}

backup_warn() {
  echo "[backup] WARNING: $*" >&2
}

# Загрузка .env без экспорта многострочных значений с пробелами в кавычках — как в других скриптах.
backup_load_env() {
  local root="${1:?}"
  if [[ -f "$root/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$root/.env"
    set +a
  fi
}

backup_compose_args() {
  COMPOSE_ARGS=()
  if [[ -n "${UPDATE_COMPOSE_FILES:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_ARGS=(${UPDATE_COMPOSE_FILES})
    return
  fi
  if [[ -n "${COMPOSE_FILE:-}" ]]; then
    local IFS=':'
    local -a files
    read -ra files <<< "$COMPOSE_FILE"
    local f
    for f in "${files[@]}"; do
      [[ -n "$f" ]] && COMPOSE_ARGS+=(-f "$f")
    done
    return
  fi
  if [[ -f docker-compose.prod.yml ]] && docker compose -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -qx db; then
    COMPOSE_ARGS=(-f docker-compose.prod.yml)
    return
  fi
  if [[ -f docker-compose.yml && -f docker-compose.local.yml ]]; then
    COMPOSE_ARGS=(-f docker-compose.yml -f docker-compose.local.yml)
    return
  fi
  if [[ -f docker-compose.yml ]]; then
    COMPOSE_ARGS=(-f docker-compose.yml)
  fi
}

backup_compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

# true, если сервис db в текущем compose запущен.
backup_db_container_running() {
  backup_compose_args
  [[ ${#COMPOSE_ARGS[@]} -gt 0 ]] || return 1
  command -v docker >/dev/null 2>&1 || return 1
  backup_compose ps --status running --services 2>/dev/null | grep -qx db
}

backup_resolve_uploads_dir() {
  local root="${1:?}"
  if [[ -n "${UPLOADS_DIR:-}" ]]; then
    if [[ "${UPLOADS_DIR}" = /* ]]; then
      printf '%s\n' "$UPLOADS_DIR"
    else
      printf '%s\n' "$root/$UPLOADS_DIR"
    fi
    return
  fi
  if [[ -d "$root/uploads" ]]; then
    printf '%s\n' "$root/uploads"
    return
  fi
  printf '%s\n' "$root/uploads"
}

backup_sha256_file() {
  local file="${1:?}"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    backup_die "Нужен sha256sum или shasum"
  fi
}

backup_write_checksums() {
  local dir="${1:?}"
  (
    cd "$dir"
    # shellcheck disable=SC2035
    find . -type f ! -name 'checksums.sha256' ! -name '*.partial' -print0 |
      sort -z |
      xargs -0 sha256sum >checksums.sha256
  )
}

backup_verify_checksums() {
  local dir="${1:?}"
  [[ -f "$dir/checksums.sha256" ]] || backup_die "Нет checksums.sha256 в $dir"
  (
    cd "$dir"
    sha256sum -c checksums.sha256
  )
}

# Парсинг DATABASE_URL → переменные (без логирования пароля).
# Экспортирует: BACKUP_DB_HOST BACKUP_DB_PORT BACKUP_DB_USER BACKUP_DB_NAME BACKUP_DB_PASSWORD BACKUP_DB_SSLMODE
backup_parse_database_url() {
  local url="${1:-${DATABASE_URL:-}}"
  [[ -n "$url" ]] || backup_die "DATABASE_URL не задан"

  # postgresql://user:pass@host:port/db?params
  local rest
  rest="${url#postgres://}"
  rest="${rest#postgresql://}"

  local creds hostport dbpart
  creds="${rest%%@*}"
  hostport="${rest#*@}"
  dbpart="${hostport#*/}"
  hostport="${hostport%%/*}"

  BACKUP_DB_USER="${creds%%:*}"
  BACKUP_DB_PASSWORD="${creds#*:}"
  # URL-decode только если есть %XX (пароли с %40 и т.п.)
  if [[ "$BACKUP_DB_PASSWORD" == *%* ]]; then
    BACKUP_DB_PASSWORD="$(printf '%b' "${BACKUP_DB_PASSWORD//%/\\x}")"
  fi

  if [[ "$hostport" == *:* ]]; then
    BACKUP_DB_HOST="${hostport%%:*}"
    BACKUP_DB_PORT="${hostport#*:}"
    BACKUP_DB_PORT="${BACKUP_DB_PORT%%\?*}"
  else
    BACKUP_DB_HOST="$hostport"
    BACKUP_DB_PORT="5432"
  fi

  BACKUP_DB_NAME="${dbpart%%\?*}"
  BACKUP_DB_SSLMODE=""
  if [[ "$dbpart" == *"sslmode="* ]]; then
    BACKUP_DB_SSLMODE="$(printf '%s' "$dbpart" | sed -n 's/.*sslmode=\([^&]*\).*/\1/p')"
  fi

  export BACKUP_DB_HOST BACKUP_DB_PORT BACKUP_DB_USER BACKUP_DB_NAME BACKUP_DB_PASSWORD BACKUP_DB_SSLMODE
}

backup_acquire_lock() {
  local lock_file="${1:?}"
  if [[ "${BACKUP_SKIP_LOCK:-0}" == "1" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$lock_file")"
  exec 9>"$lock_file"
  if command -v flock >/dev/null 2>&1; then
    if ! flock -n 9; then
      backup_die "Уже идёт другой backup/restore (lock: $lock_file)"
    fi
  else
    backup_warn "flock недоступен — параллельные запуски не блокируются"
  fi
}

backup_atomic_mv() {
  local src="${1:?}"
  local dst="${2:?}"
  mv -f "$src" "$dst"
}

# Шифрование файла (AES-256-CBC + PBKDF2). Требует BACKUP_ENCRYPT_PASSPHRASE.
backup_encrypt_file() {
  local src="${1:?}"
  local dst="${2:?}"
  [[ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]] || backup_die "BACKUP_ENCRYPT_PASSPHRASE пуст"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$src" -out "$dst" \
    -pass env:BACKUP_ENCRYPT_PASSPHRASE
  shred -u "$src" 2>/dev/null || rm -f "$src"
}

backup_decrypt_file() {
  local src="${1:?}"
  local dst="${2:?}"
  [[ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]] || backup_die "Для расшифровки задайте BACKUP_ENCRYPT_PASSPHRASE"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$src" -out "$dst" \
    -pass env:BACKUP_ENCRYPT_PASSPHRASE
}

# Удаление старых бекапов: KEEP_DAYS (по умолчанию 14) и KEEP_COUNT (по умолчанию 14).
backup_apply_retention() {
  local backups_root="${1:?}"
  local keep_days="${BACKUP_KEEP_DAYS:-30}"
  local keep_count="${BACKUP_KEEP_COUNT:-31}"

  [[ -d "$backups_root" ]] || return 0

  local -a dirs=()
  while IFS= read -r -d '' d; do
    dirs+=("$d")
  done < <(find "$backups_root" -mindepth 1 -maxdepth 1 -type d -name 'istochnik-backup-*' -print0 | sort -z)

  local now_epoch
  now_epoch="$(date +%s)"
  local d age_days base
  for d in "${dirs[@]}"; do
    base="$(basename "$d")"
    # istochnik-backup-YYYYMMDD-HHMMSS
    if [[ "$base" =~ ^istochnik-backup-([0-9]{8})-([0-9]{6})$ ]]; then
      local y="${BASH_REMATCH[1]:0:4}"
      local mo="${BASH_REMATCH[1]:4:2}"
      local day="${BASH_REMATCH[1]:6:2}"
      local hh="${BASH_REMATCH[2]:0:2}"
      local mm="${BASH_REMATCH[2]:2:2}"
      local ss="${BASH_REMATCH[2]:4:2}"
      local ts
      ts="$(date -d "${y}-${mo}-${day} ${hh}:${mm}:${ss}" +%s 2>/dev/null || echo 0)"
      if [[ "$ts" -gt 0 ]]; then
        age_days=$(( (now_epoch - ts) / 86400 ))
        if [[ "$age_days" -gt "$keep_days" ]]; then
          backup_log "Retention: удаляю старый $base (возраст ${age_days}д > ${keep_days}д)"
          rm -rf "$d"
        fi
      fi
    fi
  done

  dirs=()
  while IFS= read -r -d '' d; do
    dirs+=("$d")
  done < <(find "$backups_root" -mindepth 1 -maxdepth 1 -type d -name 'istochnik-backup-*' -print0 | sort -z)

  local total="${#dirs[@]}"
  if [[ "$total" -gt "$keep_count" ]]; then
    local to_remove=$((total - keep_count))
    local i
    for ((i = 0; i < to_remove; i++)); do
      backup_log "Retention: удаляю лишний $(basename "${dirs[$i]}") (лимит KEEP_COUNT=${keep_count})"
      rm -rf "${dirs[$i]}"
    done
  fi
}
