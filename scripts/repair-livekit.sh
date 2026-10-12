#!/usr/bin/env bash
# Диагностика + пересоздание LiveKit на сервере.
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml)

echo "== 1) .env =="
bash "$ROOT/scripts/check-livekit-env.sh" "$ROOT/.env"

echo ""
echo "== 2) recreate livekit =="
"${COMPOSE[@]}" up -d --force-recreate --no-deps livekit

echo ""
echo "== 3) wait 3s, status =="
sleep 3
"${COMPOSE[@]}" ps livekit || true
docker ps -a --filter name=livekit --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true

echo ""
echo "== 4) logs (last 60) =="
"${COMPOSE[@]}" logs livekit --tail 60 || true

echo ""
echo "== 5) host :7880 =="
if curl -fsS -m 3 http://127.0.0.1:7880/ >/tmp/lk-ok.txt 2>/tmp/lk-err.txt; then
  echo "OK: $(cat /tmp/lk-ok.txt)"
else
  echo "FAIL: $(cat /tmp/lk-err.txt)"
  echo "Смотрите логи выше (keys / yaml / port bind)."
  exit 1
fi

echo ""
echo "== 6) from web container =="
if docker exec istochnik-web wget -qO- http://host.docker.internal:7880/ 2>/tmp/web-lk.txt; then
  echo "OK web→livekit: $(cat /tmp/web-lk.txt)"
else
  echo "FAIL web→livekit: $(cat /tmp/web-lk.txt 2>/dev/null || true)"
  echo "Проверьте extra_hosts: host.docker.internal у web"
  exit 1
fi

echo ""
echo "== 7) public /lk =="
code=$(curl -sS -m 8 -o /tmp/pub-lk.txt -w "%{http_code}" https://app.church-tambov.ru/lk/ || echo 000)
echo "HTTP $code body=$(head -c 80 /tmp/pub-lk.txt)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: публичный /lk не 200 — recreate web тоже:"
  echo "  ${COMPOSE[*]} up -d --force-recreate web"
  exit 1
fi

echo ""
echo "Готово: LiveKit отвечает. Перезапустите api, если ключи менялись:"
echo "  ${COMPOSE[*]} up -d --force-recreate api"
exit 0
