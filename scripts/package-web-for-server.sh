#!/usr/bin/env bash
# Сборка Flutter web на машине с нормальным интернетом и подготовка release/web/ для Dockerfile.web.prebuilt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v flutter >/dev/null 2>&1; then
  echo "Нужен flutter в PATH." >&2
  exit 1
fi

echo "flutter pub get..."
flutter pub get

echo "flutter build web..."
flutter build web --release \
  --base-href=/ \
  --no-web-resources-cdn \
  --dart-define=API_BASE_URL=http://localhost:40978

printf '%s\n' '{"apiBaseUrl":""}' > build/web/api-config.json

mkdir -p release/web
rsync -a --delete build/web/ release/web/

echo ""
echo "Готово: release/web/ — скопируйте на сервер в $(pwd)/release/web/"
echo "На сервере: docker compose -f docker-compose.yml -f docker-compose.prod.overlay.yml -f docker-compose.web-prebuilt.yml up -d --build"
