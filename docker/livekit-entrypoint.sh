#!/bin/sh
# Запуск LiveKit с проверкой ключей. Формат LIVEKIT_KEYS: "key: secret" (пробел обязателен).
set -eu

valid_ipv4() {
  oldifs=$IFS
  IFS=.
  # shellcheck disable=SC2086
  set -- $1
  IFS=$oldifs
  [ "$#" -eq 4 ] || return 1
  for octet in "$@"; do
    case $octet in
      ''|*[!0-9]*) return 1 ;;
    esac
    if [ "$octet" -gt 255 ]; then
      return 1
    fi
  done
  return 0
}

if [ -z "${LIVEKIT_API_KEY:-}" ] || [ -z "${LIVEKIT_API_SECRET:-}" ]; then
  echo "FATAL: LIVEKIT_API_KEY / LIVEKIT_API_SECRET пустые."
  echo "Добавьте их в .env (один блок) и: docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d --force-recreate livekit"
  exit 1
fi

# LiveKit парсит keys как YAML map — нужен пробел после двоеточия.
export LIVEKIT_KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"

# Белый IP обязателен: в livekit.yaml use_external_ip=false, STUN на старте не вызывается.
# Без --node-ip сервер рекламирует адрес локального интерфейса, и клиенты из интернета не доходят.
if [ -z "${NODE_IP:-}" ]; then
  echo "FATAL: NODE_IP пуст. Задайте LIVEKIT_RTC_NODE_IP (белый IP хоста) в .env."
  exit 1
fi
if ! valid_ipv4 "$NODE_IP"; then
  echo "FATAL: NODE_IP=${NODE_IP} не является IPv4."
  exit 1
fi

echo "Starting livekit-server (key=${LIVEKIT_API_KEY}, node_ip=${NODE_IP})..."
exec /livekit-server --config /etc/livekit.yaml --node-ip "$NODE_IP"
