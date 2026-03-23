#!/usr/bin/env bash
# Сборка Flutter web на Vercel. Нужна переменная API_BASE_URL (см. Vercel → Environment Variables).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export FLUTTER_SUPPRESS_ANALYTICS=true
export GIT_TERMINAL_PROMPT=0
# Режим CI: Vercel часто запускает билд от root — предупреждение Flutter «Woah! root» можно игнорировать.
export CI=true

log() {
  echo "[vercel-build] $*"
}

fail() {
  echo "[vercel-build] ERROR: $*" >&2
  exit 1
}

# Дубликат имени (если случайно завели как у Next.js)
if [[ -z "${API_BASE_URL:-}" && -n "${NEXT_PUBLIC_API_BASE_URL:-}" ]]; then
  export API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL"
fi

log "VERCEL_ENV=${VERCEL_ENV:-unset} (Preview-деплои требуют отдельной галочки для переменной)"

if [[ -z "${API_BASE_URL:-}" ]]; then
  fail "Переменная API_BASE_URL не задана на шаге Build.

Что сделать в Vercel:
  1) Project → Settings → Environment Variables → Add New
  2) Name: API_BASE_URL
  3) Value: публичный URL вашего API, например https://api.example.com (без слэша в конце)
  4) Environments: отметьте ВСЕ, что используете — как минимум Production И Preview
     (ветки и PR собираются как Preview; если галочка только у Production — сборка Preview упадёт)
  5) Save → Deployments → … → Redeploy

Локальная проверка: API_BASE_URL=https://... bash scripts/vercel-build.sh"
fi

log "API_BASE_URL задан (длина ${#API_BASE_URL} символов)"

FLUTTER_ROOT="${FLUTTER_ROOT:-$HOME/flutter_sdk_vercel}"
if [[ ! -x "$FLUTTER_ROOT/bin/flutter" ]]; then
  log "Клонирование Flutter stable (shallow)..."
  rm -rf "$FLUTTER_ROOT"
  git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$FLUTTER_ROOT" \
    || fail "git clone Flutter не удался (сеть или лимиты). Повторите деплой."
fi

export PATH="$FLUTTER_ROOT/bin:$PATH"

log "Flutter: $(flutter --version | head -1)"

# Без интерактива; precache не обязателен и иногда падает по таймауту на CI
flutter config --no-analytics >/dev/null
flutter config --enable-web >/dev/null

log "pub get..."
flutter pub get

log "build web..."
# Без --no-web-resources-cdn CanvasKit тянется с gstatic (часто блокируется).
flutter build web --release \
  --base-href=/ \
  --no-web-resources-cdn \
  --dart-define=API_BASE_URL="$API_BASE_URL"

log "Готово: build/web"
