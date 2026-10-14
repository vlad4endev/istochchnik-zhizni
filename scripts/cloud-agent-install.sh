#!/usr/bin/env bash
# Idempotent Cloud Agent install for Источник жизни monorepo.
set -euo pipefail
cd /workspace

if [[ ! -f .env ]]; then
  cp .env.local.example .env
fi

# Postgres without Docker (cloud VMs often lack docker.sock).
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

# Bake a one-shot start helper used by environment start.
sudo tee /usr/local/bin/cloud-agent-start-postgres >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
elif command -v service >/dev/null 2>&1; then
  sudo service postgresql start 2>/dev/null || true
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "ALTER USER postgres WITH PASSWORD 'postgres';" || true
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
EOF
sudo chmod +x /usr/local/bin/cloud-agent-start-postgres

npm ci
npm --prefix web-react ci
