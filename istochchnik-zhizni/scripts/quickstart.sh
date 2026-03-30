#!/usr/bin/env bash
# Подготовка окружения: .env, зависимости, проверка сборки API и web-react.
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

echo "npm install (корень)..."
npm install

if [[ -f web-react/package.json ]]; then
  echo "npm install (web-react)..."
  npm --prefix web-react install
fi

echo "npm run build (TypeScript API)..."
npm run build

echo ""
echo "Готово. Дальше выберите вариант:"
echo ""
echo "  A) Postgres в Docker, API + React (Vite) на хосте:"
echo "       cp .env.local.example .env   # при необходимости"
echo "       npm run db:up"
echo "       npm run start-all            # или: npm run dev:start:fg"
echo ""
echo "  B) Postgres + API + веб (nginx) целиком в Docker:"
echo "       docker compose up -d --build"
echo "       Веб: http://localhost:8080  •  health: http://localhost:8080/health"
echo ""
echo "  C) Только API на хосте:"
echo "       npm run dev"
echo ""
echo "  D) API + Vite в фоне:"
echo "       npm run dev:start"
echo ""
