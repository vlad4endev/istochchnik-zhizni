#!/usr/bin/env bash
# Диагностика + пересоздание LiveKit / web / api.
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml)

echo "== 1) .env =="
bash "$ROOT/scripts/check-livekit-env.sh" "$ROOT/.env"

echo ""
echo "== 2) recreate livekit (bridge) =="
"${COMPOSE[@]}" up -d --force-recreate --no-deps livekit

echo ""
echo "== 3) wait :7880 on localhost =="
ok=0
for i in $(seq 1 15); do
  if curl -fsS -m 1 http://127.0.0.1:7880/ >/dev/null 2>&1; then
    echo "OK: :7880 на попытке $i"
    ok=1
    break
  fi
  sleep 1
done
"${COMPOSE[@]}" ps livekit || true
docker ps -a --filter name=livekit --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
echo "--- logs ---"
"${COMPOSE[@]}" logs livekit --tail 40 || true
if [[ "$ok" -ne 1 ]]; then
  echo "FAIL: LiveKit не слушает 127.0.0.1:7880"
  exit 1
fi
echo "OK: $(curl -fsS -m 3 http://127.0.0.1:7880/)"

echo ""
echo "== 4) rebuild web (nginx upstream livekit:7880) + recreate api =="
"${COMPOSE[@]}" up -d --build --force-recreate --no-deps web api

echo ""
echo "== 5) api → livekit:7880 =="
sleep 3
if docker exec istochnik-api node -e "fetch('http://livekit:7880/').then(r=>r.text()).then(t=>{console.log('OK api→livekit:',t.trim());process.exit(0)}).catch(e=>{console.error('FAIL',e);process.exit(1)})"; then
  :
else
  echo "FAIL: api не видит livekit:7880"
  exit 1
fi

echo ""
echo "== 6) web → livekit:7880 =="
if docker exec istochnik-web wget -qO- -T 3 http://livekit:7880/ 2>/tmp/web-lk.txt; then
  echo "OK web→livekit: $(cat /tmp/web-lk.txt)"
else
  echo "FAIL web→livekit: $(cat /tmp/web-lk.txt 2>/dev/null || true)"
  docker exec istochnik-web wget -qO- -T 3 http://livekit:7880/ || true
  exit 1
fi

echo ""
echo "== 7) public /lk =="
code=$(curl -sS -m 8 -o /tmp/pub-lk.txt -w "%{http_code}" https://app.church-tambov.ru/lk/ || echo 000)
echo "HTTP $code body=$(head -c 80 /tmp/pub-lk.txt)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: /lk не 200"
  docker logs istochnik-web --tail 30 || true
  exit 1
fi

echo ""
echo "Готово: сигнал LiveKit доступен. Проверьте звонок."
echo "Роутер: TCP 7881, UDP 7882 → LAN хоста."
exit 0
