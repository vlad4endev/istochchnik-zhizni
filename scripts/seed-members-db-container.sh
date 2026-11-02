#!/usr/bin/env bash
# Built-in roster seed disabled — deleted members were reappearing after rebuild.
# Archive (manual only): scripts/archive/church-roster-seed-2026-03.sql
# Prefer: bash scripts/restore.sh <backup-dir>
set -euo pipefail
echo "[seed-members] Встроенный список участников из кода отключён." >&2
echo "  Архив (только вручную): scripts/archive/church-roster-seed-2026-03.sql" >&2
echo "  Нужны участники → restore из бэкапа или админка." >&2
exit 1
