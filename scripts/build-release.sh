#!/usr/bin/env bash
# Собирает релизные артефакты (API + Web) и кладёт в release/ для деплоя.
#
# Выход:
#   release/api/   — скомпилированный backend (dist/* + package*.json)
#   release/web/   — собранный фронтенд (web-react/dist/*)
#   release/VERSION.txt
#
# Запуск: bash scripts/build-release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +'%Y-%m-%d %H:%M UTC')"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

echo "[build-release] build stamp: ${STAMP} (${SHA})"

echo "[build-release] building backend..."
npm run build

echo "[build-release] building web..."
(cd web-react && npm run build)

mkdir -p release/api release/web

rsync -a --delete dist/ release/api/dist/
rsync -a package.json package-lock.json release/api/
rsync -a --delete web-react/dist/ release/web/

cat > release/VERSION.txt <<EOF
BUILD_STAMP=${STAMP}
GIT_SHA=${SHA}
EOF

echo "[build-release] done: release/ (VERSION.txt, api/, web/)"

