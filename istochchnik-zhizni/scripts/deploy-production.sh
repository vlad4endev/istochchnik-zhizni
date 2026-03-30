#!/usr/bin/env bash
# Сборка и запуск полного стека на сервере (БД + API + веб).
# API слушает только 127.0.0.1 — снаружи используйте порт WEB_PORT (nginx) или TLS-прокси на хосте.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "[deploy-production] Создайте .env: cp .env.example .env и задайте DATABASE_URL" >&2
  exit 1
fi

# Только localhost на хосте, если в .env не задано иначе (см. API_PUBLISH в docker-compose.yml).
export API_PUBLISH="${API_PUBLISH:-127.0.0.1}"
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.overlay.yml

echo "[deploy-production] docker compose up -d --build ..."
docker compose up -d --build
docker compose ps

echo ""
echo "Готово. Веб: http://<IP>:${WEB_PORT:-8080}  (WEB_PORT в .env)"
echo "API на loopback: 127.0.0.1:${PORT:-40978} (PORT в .env — порт на хосте). С интернета — только через :${WEB_PORT:-8080} или TLS-прокси."
