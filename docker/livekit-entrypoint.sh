#!/bin/sh
# Запуск LiveKit с проверкой ключей. Формат LIVEKIT_KEYS: "key: secret" (пробел обязателен).
set -eu

if [ -z "${LIVEKIT_API_KEY:-}" ] || [ -z "${LIVEKIT_API_SECRET:-}" ]; then
  echo "FATAL: LIVEKIT_API_KEY / LIVEKIT_API_SECRET пустые."
  echo "Добавьте их в .env (один блок) и: docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d --force-recreate livekit"
  exit 1
fi

# LiveKit парсит keys как YAML map — нужен пробел после двоеточия.
export LIVEKIT_KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"

echo "Starting livekit-server (key=${LIVEKIT_API_KEY}, node_ip=${NODE_IP:-auto})..."
exec /livekit-server --config /etc/livekit.yaml
