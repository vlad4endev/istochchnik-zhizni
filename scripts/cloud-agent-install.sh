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

npm ci
npm --prefix web-react ci
