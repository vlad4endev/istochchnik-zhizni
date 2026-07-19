#!/usr/bin/env bash
# Обратная совместимость: раньше обновление шло через go-update.sh / npm run go:update.
# Актуальный скрипт — scripts/server-update.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/server-update.sh" "$@"
