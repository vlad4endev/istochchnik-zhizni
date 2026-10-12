#!/usr/bin/env bash
# Быстрая проверка .env перед запуском LiveKit (host network + TURN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: нет файла $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source <(grep -E '^(CALLS_ENABLED|VITE_CALLS_ENABLED|LIVEKIT_|PUBLIC_WEB_ORIGIN)=' "$ENV_FILE" | sed 's/\r$//' || true)
set +a

ok=1
need() {
  local n="$1" v="${!1:-}"
  if [[ -z "$v" ]]; then
    echo "FAIL: $n пустой"
    ok=0
  else
    echo "OK: $n задан"
  fi
}

need LIVEKIT_API_KEY
need LIVEKIT_API_SECRET
need LIVEKIT_URL
need LIVEKIT_PUBLIC_URL

if [[ "${CALLS_ENABLED:-}" != "true" ]]; then
  echo "FAIL: CALLS_ENABLED должен быть true (сейчас: ${CALLS_ENABLED:-<unset>})"
  ok=0
fi

if [[ "${LIVEKIT_URL:-}" == *"livekit:7880"* ]]; then
  echo "WARN: LIVEKIT_URL=$LIVEKIT_URL — лучше http://host.docker.internal:7880"
fi
if [[ "${LIVEKIT_PUBLIC_URL:-}" == *"call."* ]]; then
  echo "WARN: LIVEKIT_PUBLIC_URL=$LIVEKIT_PUBLIC_URL — лучше wss://app…/lk"
fi
if [[ "${#LIVEKIT_API_SECRET}" -lt 32 ]]; then
  echo "FAIL: LIVEKIT_API_SECRET короче 32 символов"
  ok=0
fi

# Как в docker-compose.livekit-addon.yml
KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"
if [[ "$KEYS" != *": "* ]]; then
  echo "FAIL: LIVEKIT_KEYS должен содержать ': ' (пробел после двоеточия)"
  ok=0
else
  echo "OK: LIVEKIT_KEYS формат 'key: secret' (с пробелом)"
fi

dupes="$(grep -cE '^LIVEKIT_API_KEY=' "$ENV_FILE" || true)"
if [[ "${dupes:-0}" -gt 1 ]]; then
  echo "FAIL: LIVEKIT_API_KEY встречается $dupes раз(а) в .env — оставьте один блок"
  ok=0
fi

if [[ "$ok" -ne 1 ]]; then
  echo "Итог: исправьте .env и перезапустите livekit"
  exit 1
fi
echo "Итог: .env для LiveKit выглядит ок"
exit 0
