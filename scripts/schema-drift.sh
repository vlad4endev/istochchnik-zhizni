#!/usr/bin/env bash
# Сверка двух описаний схемы БД на пустой базе:
#   app — то, что создаёт API на старте (initDb + ensure*Schema, src/cli/bootSchema.ts);
#   mig — то, что дают supabase/migrations/*.sql, применённые по порядку.
# Печатает таблицы/колонки, которые есть только в одном из вариантов. Прод-БД не трогает.
#
# Нужен админский доступ к ЛОКАЛЬНОМУ Postgres (скрипт создаёт и удаляет БД drift_app / drift_mig):
#   ADMIN_URL=postgres://postgres@localhost:5432 bash scripts/schema-drift.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ADMIN_URL="${ADMIN_URL:?Задайте ADMIN_URL, например postgres://postgres:postgres@localhost:5432}"
ADMIN_URL="${ADMIN_URL%/}"
OUT="${OUT_DIR:-$(mktemp -d)}"

psql_admin() { psql "$ADMIN_URL/postgres" -q -v ON_ERROR_STOP=1 "$@"; }
for d in drift_app drift_mig; do psql_admin -c "drop database if exists $d" -c "create database $d"; done

# Роли и схемы, которые на настоящем Supabase есть по умолчанию.
psql "$ADMIN_URL/drift_mig" -q -c "
  do \$\$ begin
    perform 1 from pg_roles where rolname='anon'; if not found then create role anon nologin; end if;
    perform 1 from pg_roles where rolname='authenticated'; if not found then create role authenticated nologin; end if;
    perform 1 from pg_roles where rolname='service_role'; if not found then create role service_role nologin; end if;
  end \$\$;
  create schema if not exists auth; create schema if not exists storage;" >/dev/null 2>&1

echo "== app: initDb + ensure*Schema"
DATABASE_URL="$ADMIN_URL/drift_app" DB_SSL=false npx ts-node --transpile-only src/cli/bootSchema.ts || exit 1

echo "== mig: supabase/migrations (ошибки не останавливают, считаются)"
mig_errors=0
for f in supabase/migrations/*.sql; do
  if ! psql "$ADMIN_URL/drift_mig" -q -v ON_ERROR_STOP=0 -f "$f" >/dev/null 2>"$OUT/err.txt" || grep -q ERROR "$OUT/err.txt"; then
    mig_errors=$((mig_errors + 1))
    echo "  ERROR в $(basename "$f"): $(grep -m1 ERROR "$OUT/err.txt")"
  fi
done

dump() {
  psql "$ADMIN_URL/$1" -Atc "select table_name||'.'||column_name||' '||data_type from information_schema.columns where table_schema='public' order by 1" > "$OUT/cols_$1.txt"
  psql "$ADMIN_URL/$1" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" > "$OUT/tabs_$1.txt"
}
dump drift_app; dump drift_mig

echo
echo "миграций с ошибками на пустой БД: $mig_errors"
echo "таблиц: app=$(wc -l < "$OUT/tabs_drift_app.txt") mig=$(wc -l < "$OUT/tabs_drift_mig.txt")"
echo "--- таблицы только в app:";        comm -23 "$OUT/tabs_drift_app.txt" "$OUT/tabs_drift_mig.txt" | sed 's/^/  /'
echo "--- таблицы только в migrations:"; comm -13 "$OUT/tabs_drift_app.txt" "$OUT/tabs_drift_mig.txt" | sed 's/^/  /'
echo "--- колонки только в app: $(comm -23 "$OUT/cols_drift_app.txt" "$OUT/cols_drift_mig.txt" | wc -l), только в migrations: $(comm -13 "$OUT/cols_drift_app.txt" "$OUT/cols_drift_mig.txt" | wc -l)"
echo "полные списки: $OUT"

for d in drift_app drift_mig; do psql_admin -c "drop database if exists $d"; done
