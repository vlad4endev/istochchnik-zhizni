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

CONFIG=/etc/livekit.yaml

# Вебхуки → API (участник вышел / комната закрыта): реакция за секунды вместо опроса cron.
# api_key должен совпадать с ключом выше, поэтому блок дописывается при старте в копию конфига.
# LIVEKIT_WEBHOOK_URL=off — выключить (останется только cron-сверка).
WEBHOOK_URL="${LIVEKIT_WEBHOOK_URL:-http://127.0.0.1:40978/api/livekit/webhook}"
if [ "$WEBHOOK_URL" != "off" ]; then
  if grep -q '^webhook:' /etc/livekit.yaml; then
    echo "WARN: в livekit.yaml уже есть webhook: — автоконфиг пропущен"
  else
    CONFIG=/tmp/livekit.generated.yaml
    cp /etc/livekit.yaml "$CONFIG"
    printf '\nwebhook:\n  api_key: %s\n  urls:\n    - %s\n' "$LIVEKIT_API_KEY" "$WEBHOOK_URL" >> "$CONFIG"
    echo "Webhook → ${WEBHOOK_URL}"
  fi
fi

echo "Starting livekit-server (key=${LIVEKIT_API_KEY}, node_ip=${NODE_IP:-auto})..."
exec /livekit-server --config "$CONFIG"
