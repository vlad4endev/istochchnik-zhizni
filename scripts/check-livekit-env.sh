#!/usr/bin/env bash
# Быстрая проверка .env перед запуском LiveKit (host network + TURN).
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: нет файла $ENV_FILE"
  exit 1
fi

# Последнее значение ключа в .env (как у docker compose). Без source/`set -u`.
env_get() {
  local key="$1" line val
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  val="${line#*=}"
  val="${val%$'\r'}"
  # снять окружающие кавычки
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
  if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  printf '%s' "$val"
}

CALLS_ENABLED="$(env_get CALLS_ENABLED)"
LIVEKIT_API_KEY="$(env_get LIVEKIT_API_KEY)"
LIVEKIT_API_SECRET="$(env_get LIVEKIT_API_SECRET)"
LIVEKIT_URL="$(env_get LIVEKIT_URL)"
LIVEKIT_PUBLIC_URL="$(env_get LIVEKIT_PUBLIC_URL)"
LIVEKIT_RTC_NODE_IP="$(env_get LIVEKIT_RTC_NODE_IP)"
PUBLIC_WEB_ORIGIN="$(env_get PUBLIC_WEB_ORIGIN)"
VITE_CALLS_ENABLED="$(env_get VITE_CALLS_ENABLED)"

ok=1
need() {
  local n="$1" v="$2"
  if [[ -z "$v" ]]; then
    echo "FAIL: $n пустой"
    ok=0
  else
    echo "OK: $n задан"
  fi
}

need LIVEKIT_API_KEY "$LIVEKIT_API_KEY"
need LIVEKIT_API_SECRET "$LIVEKIT_API_SECRET"
need LIVEKIT_URL "$LIVEKIT_URL"
need LIVEKIT_PUBLIC_URL "$LIVEKIT_PUBLIC_URL"

if [[ "$CALLS_ENABLED" != "true" ]]; then
  echo "FAIL: CALLS_ENABLED должен быть true (сейчас: ${CALLS_ENABLED:-<unset>})"
  ok=0
else
  echo "OK: CALLS_ENABLED=true"
fi

if [[ -n "$VITE_CALLS_ENABLED" && "$VITE_CALLS_ENABLED" != "true" ]]; then
  echo "WARN: VITE_CALLS_ENABLED=$VITE_CALLS_ENABLED (для UI лучше true; нужен rebuild web)"
fi

if [[ "$LIVEKIT_URL" == *"livekit:7880"* ]]; then
  echo "WARN: LIVEKIT_URL=$LIVEKIT_URL — лучше http://host.docker.internal:7880"
fi
if [[ "$LIVEKIT_PUBLIC_URL" == *"call."* ]]; then
  echo "WARN: LIVEKIT_PUBLIC_URL=$LIVEKIT_PUBLIC_URL — лучше wss://app…/lk"
fi
if [[ -n "$LIVEKIT_API_SECRET" && "${#LIVEKIT_API_SECRET}" -lt 32 ]]; then
  echo "FAIL: LIVEKIT_API_SECRET короче 32 символов"
  ok=0
fi

if [[ -n "$LIVEKIT_API_KEY" && -n "$LIVEKIT_API_SECRET" ]]; then
  echo "OK: LIVEKIT_KEYS будет '${LIVEKIT_API_KEY}: ***' (пробел после : обязателен в compose)"
fi

if [[ -n "$LIVEKIT_RTC_NODE_IP" ]]; then
  echo "OK: LIVEKIT_RTC_NODE_IP=$LIVEKIT_RTC_NODE_IP"
else
  echo "WARN: LIVEKIT_RTC_NODE_IP не задан — LiveKit возьмёт IP через STUN"
fi

if [[ -z "$PUBLIC_WEB_ORIGIN" ]]; then
  echo "WARN: PUBLIC_WEB_ORIGIN пустой"
fi

dupes="$(grep -cE '^[[:space:]]*(export[[:space:]]+)?LIVEKIT_API_KEY=' "$ENV_FILE" || true)"
if [[ "${dupes:-0}" -gt 1 ]]; then
  echo "FAIL: LIVEKIT_API_KEY встречается $dupes раз(а) в .env — оставьте один блок"
  ok=0
fi

if [[ "$ok" -ne 1 ]]; then
  echo "Итог: исправьте .env (один блок CALLS_/LIVEKIT_) и перезапустите livekit"
  exit 1
fi
echo "Итог: .env для LiveKit выглядит ок"
exit 0
