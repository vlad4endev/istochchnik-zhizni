#!/usr/bin/env bash
# Аудит БД только на чтение. Использование:
#   AUDIT_DATABASE_URL='postgresql://...' bash scripts/db-audit.sh
# Лучше выдать отдельную роль с правом только SELECT (см. docs/backend-audit.md).
# Если AUDIT_DATABASE_URL не задан, берётся DATABASE_URL из .env — но это боевая строка, поэтому
# скрипт сначала показывает, куда подключается, и просит подтверждение.
set -euo pipefail

cd "$(dirname "$0")/.."

URL="${AUDIT_DATABASE_URL:-}"
if [ -z "$URL" ] && [ -f .env ]; then
  URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi
if [ -z "$URL" ]; then
  echo "Задайте AUDIT_DATABASE_URL (лучше read-only роль) или DATABASE_URL в .env" >&2
  exit 1
fi

# Показываем хост и пользователя, пароль скрываем.
SAFE="$(printf '%s' "$URL" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#')"
echo "Подключение: $SAFE"
if [ -z "${AUDIT_DATABASE_URL:-}" ] && [ -t 0 ]; then
  read -r -p "Это строка из .env (возможно боевая). Запросы только на чтение. Продолжить? [y/N] " ans
  [ "${ans:-N}" = "y" ] || { echo "Отменено."; exit 1; }
fi

PGOPTIONS='-c default_transaction_read_only=on' psql "$URL" -X -q -f scripts/db-audit-readonly.sql
