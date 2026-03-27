#!/usr/bin/env bash
# Сборка web-react (Vite) и подготовка release/web/ для Dockerfile.web.prebuilt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "Нужен npm в PATH." >&2
  exit 1
fi

echo "npm ci + build (web-react)..."
(cd web-react && npm ci && npm run build)

mkdir -p release/web
rsync -a --delete web-react/dist/ release/web/

echo ""
echo "Готово: release/web/ — скопируйте на сервер в $(pwd)/release/web/"
echo "На сервере: docker compose -f docker-compose.yml -f docker-compose.prod.overlay.yml -f docker-compose.web-prebuilt.yml up -d --build"
