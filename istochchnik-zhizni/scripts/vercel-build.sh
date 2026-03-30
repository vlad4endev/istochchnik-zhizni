#!/usr/bin/env bash
# Сборка web-react (Vite) на Vercel. Задайте VITE_API_BASE_URL или API_BASE_URL в Vercel → Environment Variables.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() {
  echo "[vercel-build] $*"
}

fail() {
  echo "[vercel-build] ERROR: $*" >&2
  exit 1
}

if [[ -z "${VITE_API_BASE_URL:-}" && -n "${API_BASE_URL:-}" ]]; then
  export VITE_API_BASE_URL="$API_BASE_URL"
fi
if [[ -z "${VITE_API_BASE_URL:-}" && -n "${NEXT_PUBLIC_API_BASE_URL:-}" ]]; then
  export VITE_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL"
fi

log "VERCEL_ENV=${VERCEL_ENV:-unset}"

if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
  fail "Задайте переменную VITE_API_BASE_URL или API_BASE_URL (публичный URL API без слэша в конце).

В Vercel: Project → Settings → Environment Variables:
  Name: API_BASE_URL (или сразу VITE_API_BASE_URL)
  Value: https://api.example.com
  Environments: Production и Preview

Локально: API_BASE_URL=https://… bash scripts/vercel-build.sh"
fi

log "VITE_API_BASE_URL задан (длина ${#VITE_API_BASE_URL} символов)"

log "npm run build (web-react)…"
(
  cd web-react
  npm run build
)

log "Готово: web-react/dist"
