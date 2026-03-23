#!/usr/bin/env bash
# Сборка Flutter web на Vercel. Требуется переменная окружения API_BASE_URL (URL вашего Node API).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "Ошибка: задайте в Vercel → Settings → Environment Variables переменную API_BASE_URL (например https://api.example.com без слэша в конце)." >&2
  exit 1
fi

FLUTTER_ROOT="${FLUTTER_ROOT:-$HOME/flutter_sdk_vercel}"
if [[ ! -x "$FLUTTER_ROOT/bin/flutter" ]]; then
  echo "Установка Flutter (stable)..."
  rm -rf "$FLUTTER_ROOT"
  git clone https://github.com/flutter/flutter.git -b stable --depth 1 "$FLUTTER_ROOT"
fi

export PATH="$FLUTTER_ROOT/bin:$PATH"
flutter config --no-analytics --enable-web
flutter precache --web
flutter pub get
# Без --no-web-resources-cdn Flutter тянет CanvasKit с gstatic — на части сетей страница остаётся белой.
flutter build web --release \
  --base-href=/ \
  --no-web-resources-cdn \
  --dart-define=API_BASE_URL="$API_BASE_URL"

echo "Готово: build/web"
