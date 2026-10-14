#!/usr/bin/env bash
# Per-boot Cloud Agent start: ensure local Postgres is up for API/dev.
set -euo pipefail

if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
elif command -v service >/dev/null 2>&1; then
  sudo service postgresql start 2>/dev/null || true
fi

# Role + DB matching .env.local.example
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL' || true
ALTER USER postgres WITH PASSWORD 'postgres';
SELECT 'ok';
SQL
if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='istochik_db'" | grep -q 1; then
  sudo -u postgres createdb -O postgres istochik_db || true
fi

for _ in $(seq 1 30); do
  if PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d istochik_db -c 'SELECT 1' >/dev/null 2>&1; then
    echo "postgres ready on 127.0.0.1:5432/istochik_db"
    exit 0
  fi
  sleep 1
done
echo "postgres failed to become ready" >&2
exit 1
