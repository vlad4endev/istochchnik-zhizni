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
  echo ">>> Для разработки на хосте с «npm run dev» удобнее: cp .env.local.example .env"
  echo ">>> Для полного Docker стека оставьте .env с хостом db в DATABASE_URL."
  echo "    Supabase: пароль из Dashboard → Database (pooler :5432, sslmode=require)."
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
echo "  A) Только Postgres в Docker, API+Flutter на Mac/ПК (без Docker для Node):"
echo "       cp .env.local.example .env"
echo "       npm install && npm run db:up"
echo "       npm run dev:all"
echo "       Или в двух терминалах: npm run dev  и  flutter run ... (см. README)"
echo ""
echo "  B) Postgres + API + веб (nginx) целиком в Docker:"
echo "       docker compose up -d --build"
echo "       Веб: http://localhost:8080  •  health: http://localhost:8080/health"
echo ""
echo "  C) Только API на хосте (в .env уже указан Supabase или другой DATABASE_URL):"
echo "       npm run dev"
echo ""
echo "  D) Flutter в браузере + API в фоне (bash, нужен flutter):"
echo "       npm run dev:start"
echo ""
