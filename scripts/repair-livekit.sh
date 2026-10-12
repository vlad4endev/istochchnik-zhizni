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
"${COMPOSE[@]}" pull livekit 2>/dev/null || true
"${COMPOSE[@]}" up -d --force-recreate --no-deps livekit

echo ""
echo "== 3) wait / status =="
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 1 http://127.0.0.1:7880/ >/dev/null 2>&1; then
    echo "OK: :7880 ответил на попытке $i"
    break
  fi
  sleep 1
done
"${COMPOSE[@]}" ps livekit || true
docker ps -a --filter name=livekit --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
echo "--- docker inspect State ---"
docker inspect --format '{{.Name}} status={{.State.Status}} exit={{.State.ExitCode}} err={{.State.Error}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' \
  "$(docker ps -aq --filter name=livekit | head -1)" 2>/dev/null || true

echo ""
echo "== 4) logs (last 80) =="
"${COMPOSE[@]}" logs livekit --tail 80 || true

echo ""
echo "== 5) host :7880 =="
if curl -fsS -m 3 http://127.0.0.1:7880/ >/tmp/lk-ok.txt 2>/tmp/lk-err.txt; then
  echo "OK: $(cat /tmp/lk-ok.txt)"
else
  echo "FAIL: $(cat /tmp/lk-err.txt)"
  echo ""
  echo "Частые причины в логах выше:"
  echo "  - could not parse config / unknown field"
  echo "  - keys must be provided / Could not parse keys"
  echo "  - bind: address already in use (7880/7881/3478)"
  echo "  - failed to get external IP (use_external_ip)"
  exit 1
fi

echo ""
echo "== 6) from web container =="
if docker exec istochnik-web wget -qO- http://host.docker.internal:7880/ 2>/tmp/web-lk.txt; then
  echo "OK web→livekit: $(cat /tmp/web-lk.txt)"
else
  echo "FAIL web→livekit (пересоздаём web с extra_hosts)..."
  "${COMPOSE[@]}" up -d --force-recreate --no-deps web
  sleep 2
  docker exec istochnik-web wget -qO- http://host.docker.internal:7880/ && echo || {
    echo "FAIL web→livekit после recreate"
    exit 1
  }
fi

echo ""
echo "== 7) public /lk =="
code=$(curl -sS -m 8 -o /tmp/pub-lk.txt -w "%{http_code}" https://app.church-tambov.ru/lk/ || echo 000)
echo "HTTP $code body=$(head -c 80 /tmp/pub-lk.txt)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: публичный /lk не 200 — recreate web:"
  "${COMPOSE[@]}" up -d --force-recreate --no-deps web
  sleep 2
  code=$(curl -sS -m 8 -o /tmp/pub-lk.txt -w "%{http_code}" https://app.church-tambov.ru/lk/ || echo 000)
  echo "retry HTTP $code body=$(head -c 80 /tmp/pub-lk.txt)"
  [[ "$code" == "200" ]] || exit 1
fi

echo ""
echo "== 8) recreate api (те же ключи) =="
"${COMPOSE[@]}" up -d --force-recreate --no-deps api
sleep 2
curl -fsS -m 5 https://app.church-tambov.ru/health || true
echo ""
echo "Готово: LiveKit + api. Проверьте звонок."
exit 0
