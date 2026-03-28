#!/usr/bin/env bash
# API (Express) + Vite (web-react) в текущем терминале — то же, что ./start-all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec bash "$ROOT/start-all"
