#!/usr/bin/env bash
# Сборка Flutter web на Vercel. Нужна переменная API_BASE_URL (см. Vercel → Environment Variables).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export FLUTTER_SUPPRESS_ANALYTICS=true
export GIT_TERMINAL_PROMPT=0

log() {
  echo "[vercel-build] $*"
}

fail() {
  echo "[vercel-build] ERROR: $*" >&2
  exit 1
}

if [[ -z "${API_BASE_URL:-}" ]]; then
  fail "Переменная API_BASE_URL не задана. В Vercel: Project → Settings → Environment Variables → добавьте API_BASE_URL и отметьте галочки Production и Preview (и при необходимости Development), затем Redeploy. Без неё сборка не может подставить URL API в билд."
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
