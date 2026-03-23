#!/usr/bin/env bash
# Подготовка окружения: .env, зависимости, проверка сборки.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== istochchnik_zhizni — быстрый старт ==="

if [[ ! -f .env ]]; then
  echo "Создаю .env из .env.example..."
  cp .env.example .env
  echo ""
  echo ">>> Откройте файл .env и задайте DATABASE_URL:"
  echo "    • Локальный Postgres через Docker: оставьте строку с хостом db (см. .env.example)."
  echo "    • Supabase: подставьте пароль из Dashboard → Database (pooler :5432, sslmode=require)."
  echo ""
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: нужен Node.js (LTS)." >&2
  exit 1
fi

echo "npm install..."
npm install

echo "npm run build (TypeScript API)..."
npm run build

if command -v flutter >/dev/null 2>&1; then
  echo "flutter pub get..."
  flutter pub get
else
  echo "Предупреждение: flutter не найден в PATH — пропускаю flutter pub get (нужен для UI)."
fi

echo ""
echo "Готово. Дальше выберите вариант:"
echo ""
echo "  A) Postgres + API + веб (nginx) в Docker:"
echo "       docker compose up -d --build"
echo "       Веб: http://localhost:8080  •  health: http://localhost:8080/health"
echo "       API на хосте: http://localhost:40978/health (если PORT=40978 в .env)"
echo ""
echo "  B) Только API на хосте (в .env уже указан Supabase или другой DATABASE_URL):"
echo "       npm run dev"
echo ""
echo "  C) Flutter в браузере + API (нужен flutter):"
echo "       npm run dev:start"
echo ""
