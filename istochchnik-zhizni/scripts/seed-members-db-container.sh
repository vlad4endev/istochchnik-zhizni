#!/usr/bin/env bash
# Заливка базового списка участников через контейнер Postgres (когда порт 5432 не проброшен на хост).
# Использование из корня репозитория:
#   bash scripts/seed-members-db-container.sh
# или:
#   npm run db:seed-members:docker
#
# Подхватывает COMPOSE_FILE / COMPOSE_PATH: задайте файл compose, которым поднимаете стек
# (например export COMPOSE_FILE=docker-compose.prod.yml).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SQL_FILE="$ROOT/scripts/seed-members-base.sql"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "Не найден $SQL_FILE" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

COMPOSE_ARGS=()
if [[ -n "${COMPOSE_FILE:-}" ]]; then
  # Как в Docker Compose: несколько файлов через «:» (Linux/macOS)
  IFS=':' read -ra FILES <<< "$COMPOSE_FILE"
  for f in "${FILES[@]}"; do
    [[ -n "$f" ]] && COMPOSE_ARGS+=(-f "$f")
  done
elif [[ -f docker-compose.prod.yml ]]; then
  COMPOSE_ARGS=(-f docker-compose.prod.yml)
else
  COMPOSE_ARGS=(-f docker-compose.yml)
fi

echo "[seed-members] compose: docker compose ${COMPOSE_ARGS[*]}"
if [[ -n "${COMPOSE_FILE:-}" ]]; then
  echo "[seed-members] Подсказка: сейчас действует переменная COMPOSE_FILE. Для стека по умолчанию (prod-файл, если есть): unset COMPOSE_FILE или npm run db:seed-members:docker:prod"
fi

# Внутри образа postgres локальное подключение к серверу в том же контейнере обычно без пароля.
exec docker compose "${COMPOSE_ARGS[@]}" exec -T db \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-istochik_db}" -v ON_ERROR_STOP=1 \
  < "$SQL_FILE"
