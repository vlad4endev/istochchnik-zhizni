#!/usr/bin/env bash
# Применяет все SQL-миграции из supabase/migrations/ к удалённой базе Supabase.
# Только Storage без полного push: scripts/ensure-supabase-storage-buckets.sql в Dashboard → SQL.
# Требуется: в .env задан корректный DATABASE_URL с паролем БД (не publishable key).
# Установка CLI не нужна: используется npx supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  echo "Создайте .env (скопируйте из .env.example) и задайте DATABASE_URL."
  exit 1
fi
DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "В .env отсутствует строка DATABASE_URL=..."
  exit 1
fi
export DATABASE_URL
exec npx --yes supabase@latest db push --db-url "$DATABASE_URL"
