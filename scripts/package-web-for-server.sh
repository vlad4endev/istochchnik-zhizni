#!/usr/bin/env bash
# Сборка web-react (Vite) и подготовка release/web/ для Dockerfile.web.prebuilt.
#
# Запуск:
#   из корня репозитория:  bash scripts/package-web-for-server.sh
#   из каталога web-react: npm run package:server
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
echo "Готово: release/web/"

# Portainer web-runtime монтирует WEB_DIST_PATH поверх образа — без rsync сайт не обновится.
WEB_DIST="${WEB_DIST_PATH:-}"
if [[ -z "$WEB_DIST" && -f .env ]]; then
  WEB_DIST="$(sed -n 's/^[[:space:]]*WEB_DIST_PATH[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d '"'\''[:space:]')"
fi
if [[ -n "$WEB_DIST" ]]; then
  mkdir -p "$WEB_DIST"
  echo "WEB_DIST_PATH=$WEB_DIST — синхронизирую release/web/ → каталог статики…"
  rsync -a --delete release/web/ "$WEB_DIST/"
  echo "OK: статика в $WEB_DIST обновлена."
else
  echo "Скопируйте на сервер в $(pwd)/release/web/"
  echo "На сервере: docker compose -f docker-compose.yml -f docker-compose.prod.overlay.yml -f docker-compose.web-prebuilt.yml up -d --build"
  echo "Если используется Portainer web-runtime: rsync -a --delete release/web/ \"\$WEB_DIST_PATH/\""
fi

echo ""
echo "Важно: если в /admin всё ещё текст «Заглушка панели администратора», на сервере отдаётся"
echo "старый билд или не та ветка (нужен main с коммитами admin / AdminPage)."
echo "Проверка: после деплоя откройте /admin-panel.txt — должно быть «admin-panel-v2-react»."
echo "Docker (без WEB_DIST_PATH): docker compose build --no-cache web && docker compose up -d web"
