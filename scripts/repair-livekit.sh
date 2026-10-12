#!/usr/bin/env bash
# Диагностика + пересоздание LiveKit (host network) / web / api.
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml)

echo "== 1) .env =="
bash "$ROOT/scripts/check-livekit-env.sh" "$ROOT/.env"

echo ""
echo "== 2) docker → host :7880 (UFW/iptables) =="
# UFW часто «глотает» пакеты с docker0 на host-network порты (wget висит).
if command -v ufw >/dev/null 2>&1; then
  for cidr in 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16; do
    ufw status 2>/dev/null | grep -q "${cidr}.*7880" || \
      ufw allow from "$cidr" to any port 7880 proto tcp comment 'livekit-docker-signal' 2>/dev/null || true
  done
  echo "ufw: правила для 7880 с docker-сетей (если есть права root)"
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 7880 -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
  iptables -C DOCKER-USER -p tcp --dport 7880 -j ACCEPT 2>/dev/null || \
    iptables -I DOCKER-USER -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
  echo "iptables: попытка открыть tcp/7880"
fi

echo ""
echo "== 3) recreate livekit (host network, v1.13.9) =="
"${COMPOSE[@]}" pull livekit 2>/dev/null || true
"${COMPOSE[@]}" up -d --force-recreate --no-deps livekit

echo ""
echo "== 4) wait :7880 =="
ok=0
for i in $(seq 1 20); do
  if curl -fsS -m 1 http://127.0.0.1:7880/ >/dev/null 2>&1; then
    echo "OK: :7880 на попытке $i"
    ok=1
    break
  fi
  sleep 1
done
"${COMPOSE[@]}" ps livekit || true
"${COMPOSE[@]}" logs livekit --tail 50 || true
if [[ "$ok" -ne 1 ]]; then
  echo "FAIL: LiveKit не слушает 127.0.0.1:7880"
  exit 1
fi

echo ""
echo "== 5) rebuild web + recreate api =="
"${COMPOSE[@]}" up -d --build --force-recreate --no-deps web api
sleep 4

echo ""
echo "== 6) api/web → host LiveKit =="
probe() {
  local name="$1" cmd="$2"
  if timeout 4 bash -c "$cmd"; then
    echo "OK $name"
    return 0
  fi
  echo "FAIL $name"
  return 1
}

probe "api→host.docker.internal:7880" \
  "docker exec istochnik-api node -e \"fetch('http://host.docker.internal:7880/',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(t=>{console.log(t.trim());if(!t.includes('OK')&&t.length>20)throw 1}).catch(e=>{console.error(e);process.exit(1)})\"" \
  || probe "api→172.17.0.1:7880" \
  "docker exec istochnik-api node -e \"fetch('http://172.17.0.1:7880/',{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(console.log)\"" \
  || { echo "FAIL: api не достучался до LiveKit на хосте — нужны права root для ufw/iptables в шаге 2"; exit 1; }

probe "web→host.docker.internal:7880" \
  "docker exec istochnik-web wget -qO- -T 3 http://host.docker.internal:7880/" \
  || probe "web→172.17.0.1:7880" \
  "docker exec istochnik-web wget -qO- -T 3 http://172.17.0.1:7880/" \
  || { echo "FAIL: web не видит LiveKit"; exit 1; }

echo ""
echo "== 7) public /lk + WSS rtc =="
code=$(curl -sS -m 8 -o /tmp/pub-lk.txt -w "%{http_code}" https://app.church-tambov.ru/lk/ || echo 000)
echo "HTTP $code body=$(head -c 40 /tmp/pub-lk.txt)"
[[ "$code" == "200" ]] || { echo "FAIL /lk"; exit 1; }

echo ""
echo "== 8) порты ICE/TURN на хосте =="
ss -lntu 2>/dev/null | grep -E ':788[012]\s|:3478\s|:50100\s' || \
  netstat -lntu 2>/dev/null | grep -E '788[012]|3478|50100' || true
echo "Роутер должен пробрасывать: TCP 7881, UDP 7882, UDP 3478, UDP 50100"

echo ""
echo "Готово. Проверьте звонок (WAN и в той же Wi‑Fi)."
exit 0
