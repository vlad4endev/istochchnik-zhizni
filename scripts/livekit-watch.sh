#!/usr/bin/env bash
# Следит за LiveKit и поднимает его, если сигналинг на :7880 пропал.
#
# Контейнер с restart: always не помогает, когда процесс падает на старте
# (STUN: «could not resolve external IP»). Скрипт тогда выключает
# use_external_ip, прописывает node_ip из LIVEKIT_RTC_NODE_IP и пересоздаёт
# только сервис livekit — сайт и API не трогает.
#
#   bash scripts/livekit-watch.sh            # одна проверка
#   bash scripts/livekit-watch.sh --quiet    # для таймера: молчит, пока всё живо
#   sudo bash scripts/livekit-watch.sh --install
#   sudo bash scripts/livekit-watch.sh --uninstall
#   bash scripts/livekit-watch.sh --fix-config   # только поправить yaml, без docker
#   bash scripts/livekit-watch.sh --self-test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YAML="$ROOT/docker/livekit.yaml"
ENV_FILE="$ROOT/.env"
LOG_DIR="$ROOT/logs"
LOCK_FILE="$LOG_DIR/livekit-watch.lock"
COOLDOWN_FILE="$LOG_DIR/livekit-watch.last"
COOLDOWN_SEC=120
# Совпадает с дефолтом NODE_IP в docker-compose.livekit-addon.yml.
DEFAULT_NODE_IP="77.93.125.36"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.livekit-addon.yml")
UNIT_SERVICE="istochnik-livekit-watch.service"
UNIT_TIMER="istochnik-livekit-watch.timer"

MODE="run"
QUIET=0

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) MODE="install" ;;
    --uninstall) MODE="uninstall" ;;
    --fix-config) MODE="fix-config" ;;
    --self-test) MODE="self-test" ;;
    --quiet) QUIET=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Неизвестный аргумент: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

say() {
  if [[ "$QUIET" -eq 0 ]]; then
    printf '%s\n' "$*"
  fi
}

note() {
  printf '%s\n' "[livekit-watch $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

valid_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local o1="${BASH_REMATCH[1]}" o2="${BASH_REMATCH[2]}" o3="${BASH_REMATCH[3]}" o4="${BASH_REMATCH[4]}"
  ((10#$o1 <= 255 && 10#$o2 <= 255 && 10#$o3 <= 255 && 10#$o4 <= 255))
}

env_get() {
  local key="$1" line val
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
  if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  printf '%s' "$val"
}

resolve_node_ip() {
  local ip
  ip="$(env_get LIVEKIT_RTC_NODE_IP)"
  if [[ -z "$ip" ]]; then
    ip="$DEFAULT_NODE_IP"
  fi
  if ! valid_ipv4 "$ip"; then
    echo "LIVEKIT_RTC_NODE_IP=${ip} не является IPv4" >&2
    return 1
  fi
  printf '%s' "$ip"
}

# Печатает исправленный yaml в stdout. IP берётся из переменной NODE_IP.
render_livekit_yaml() {
  NODE_IP="$1" awk '
    BEGIN { ip = ENVIRON["NODE_IP"]; in_rtc = 0; saw_use = 0; saw_node = 0 }
    function flush_rtc() {
      if (!saw_use) print "  use_external_ip: false"
      if (!saw_node) print "  node_ip: " ip
    }
    /^[^[:space:]#]/ {
      if (in_rtc) flush_rtc()
      in_rtc = ($0 ~ /^rtc:[[:space:]]*$/)
      if (!in_rtc) { saw_use = 0; saw_node = 0 }
      print
      next
    }
    in_rtc && /^[[:space:]]*use_external_ip:/ {
      print "  use_external_ip: false"
      saw_use = 1
      if (!saw_node) {
        print "  node_ip: " ip
        saw_node = 1
      }
      next
    }
    in_rtc && /^[[:space:]]*node_ip:/ {
      if (saw_node) next
      print "  node_ip: " ip
      saw_node = 1
      next
    }
    { print }
    END { if (in_rtc) flush_rtc() }
  ' "$2"
}

# 0 — файл изменён, 1 — уже в порядке.
patch_livekit_yaml() {
  local file="$1" ip="$2" tmp
  tmp="$(mktemp)"
  render_livekit_yaml "$ip" "$file" >"$tmp"
  if cmp -s "$file" "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  cp -a "$file" "${file}.bak"
  mv "$tmp" "$file"
  return 0
}

yaml_forces_stun() {
  grep -E '^[[:space:]]*use_external_ip:[[:space:]]*true([[:space:]]|$)' "$YAML" >/dev/null
}

yaml_has_node_ip() {
  local ip="$1"
  local escaped="${ip//./\\.}"
  grep -E "^[[:space:]]*node_ip:[[:space:]]*${escaped}[[:space:]]*(#.*)?$" "$YAML" >/dev/null
}

entrypoint_passes_node_ip() {
  grep -E 'exec[[:space:]]+/livekit-server.*--node-ip' "$ROOT/docker/livekit-entrypoint.sh" >/dev/null
}

# Конфиг опасен, если STUN обязателен на старте, или старый entrypoint
# не получит белый IP (тогда процесс либо падает, либо рекламирует LAN).
config_needs_patch() {
  local ip="$1"
  if yaml_forces_stun; then
    return 0
  fi
  if ! yaml_has_node_ip "$ip" && ! entrypoint_passes_node_ip; then
    return 0
  fi
  return 1
}

livekit_listening() {
  curl -fsS -m 2 -o /dev/null "http://127.0.0.1:7880/"
}

open_docker_to_host_7880() {
  if [[ "$(id -u)" -ne 0 ]]; then
    return 0
  fi
  if command -v ufw >/dev/null 2>&1; then
    local cidr
    for cidr in 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16; do
      ufw status 2>/dev/null | grep -q "${cidr}.*7880" || \
        ufw allow from "$cidr" to any port 7880 proto tcp comment 'livekit-docker-signal' >/dev/null 2>&1 || true
    done
  fi
  if command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport 7880 -j ACCEPT 2>/dev/null || \
      iptables -I INPUT -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
    iptables -C DOCKER-USER -p tcp --dport 7880 -j ACCEPT 2>/dev/null || \
      iptables -I DOCKER-USER -p tcp --dport 7880 -j ACCEPT 2>/dev/null || true
  fi
}

calls_disabled() {
  local v
  v="$(env_get CALLS_ENABLED)"
  v="${v,,}"
  [[ "$v" == "false" || "$v" == "0" || "$v" == "no" || "$v" == "off" ]]
}

wait_livekit() {
  local i
  for i in $(seq 1 25); do
    if livekit_listening; then
      return 0
    fi
    sleep 1
  done
  return 1
}

recreate_livekit() {
  (cd "$ROOT" && "${COMPOSE[@]}" up -d --force-recreate --no-deps livekit)
}

install_timer() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Нужен root: sudo bash scripts/livekit-watch.sh --install" >&2
    exit 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd не найден. Добавьте в cron:" >&2
    echo "* * * * * cd $ROOT && /usr/bin/bash scripts/livekit-watch.sh --quiet >>$LOG_DIR/livekit-watch.log 2>&1" >&2
    exit 1
  fi
  mkdir -p "$LOG_DIR"
  cat >"/etc/systemd/system/$UNIT_SERVICE" <<EOF
[Unit]
Description=Restore Istochnik LiveKit when :7880 is down
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=/usr/bin/bash $ROOT/scripts/livekit-watch.sh --quiet
EOF
  cat >"/etc/systemd/system/$UNIT_TIMER" <<EOF
[Unit]
Description=Check Istochnik LiveKit every minute

[Timer]
OnBootSec=45
OnUnitActiveSec=60
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$UNIT_TIMER"
  systemctl start "$UNIT_SERVICE" || true
  echo "Таймер включён: systemctl status $UNIT_TIMER"
  echo "Журнал: journalctl -u $UNIT_SERVICE -n 40 --no-pager"
}

uninstall_timer() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Нужен root: sudo bash scripts/livekit-watch.sh --uninstall" >&2
    exit 1
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now "$UNIT_TIMER" 2>/dev/null || true
    rm -f "/etc/systemd/system/$UNIT_SERVICE" "/etc/systemd/system/$UNIT_TIMER"
    systemctl daemon-reload
  fi
  echo "Таймер снят."
}

self_test() {
  local tmp ip="77.93.125.36" out
  tmp="$(mktemp)"
  cat >"$tmp" <<'EOF'
rtc:
  udp_port: 7882
  tcp_port: 7881
  use_external_ip: true
  # comment use_external_ip: true must stay
  advertise_internal_ip: true
  skip_external_ip_validation: true

turn:
  enabled: true
EOF
  out="$(render_livekit_yaml "$ip" "$tmp")"
  printf '%s\n' "$out" | grep -q '^  use_external_ip: false$'
  printf '%s\n' "$out" | grep -q '^  node_ip: 77.93.125.36$'
  printf '%s\n' "$out" | grep -q 'comment use_external_ip: true must stay'
  printf '%s\n' "$out" | grep -q '^turn:$'
  if printf '%s\n' "$out" | grep -q 'use_external_ip: true$'; then
    echo "self-test: STUN flag survived" >&2
    exit 1
  fi
  # Уже исправленный файл не должен меняться.
  printf '%s\n' "$out" >"$tmp"
  local again
  again="$(render_livekit_yaml "$ip" "$tmp")"
  if [[ "$again" != "$(cat "$tmp")" ]]; then
    echo "self-test: patch is not idempotent" >&2
    exit 1
  fi
  rm -f "$tmp"
  echo "livekit-watch self-test ok"
}

run_fix_config() {
  local ip
  ip="$(resolve_node_ip)"
  if ! config_needs_patch "$ip"; then
    say "rtc config уже без STUN, node_ip=$ip"
    return 0
  fi
  if patch_livekit_yaml "$YAML" "$ip"; then
    note "Обновлён $YAML: use_external_ip=false, node_ip=$ip (копия ${YAML}.bak)"
  else
    say "rtc config уже без STUN, node_ip=$ip"
  fi
}

run_watch() {
  mkdir -p "$LOG_DIR"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    say "уже выполняется"
    exit 0
  fi

  if calls_disabled; then
    say "CALLS_ENABLED выключен — проверку пропускаю"
    exit 0
  fi

  local ip stun=0 listening=0
  ip="$(resolve_node_ip)"
  if yaml_forces_stun; then
    stun=1
  fi
  if livekit_listening; then
    listening=1
  fi

  if [[ "$stun" -eq 0 && "$listening" -eq 1 ]]; then
    say "OK: LiveKit слушает 127.0.0.1:7880"
    exit 0
  fi

  local now last=0
  now="$(date +%s)"
  if [[ -f "$COOLDOWN_FILE" ]]; then
    last="$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)"
  fi
  if [[ "$listening" -eq 0 && "$stun" -eq 0 && "$last" =~ ^[0-9]+$ && $((now - last)) -lt "$COOLDOWN_SEC" ]]; then
    say "LiveKit ещё не поднялся, следующая попытка через $((COOLDOWN_SEC - (now - last))) с"
    exit 0
  fi

  printf '%s\n' "$now" >"$COOLDOWN_FILE"

  local changed=0
  if config_needs_patch "$ip"; then
    if patch_livekit_yaml "$YAML" "$ip"; then
      changed=1
      note "Поправил rtc config: use_external_ip=false, node_ip=$ip"
    fi
  fi

  if [[ "$listening" -eq 1 && "$changed" -eq 0 ]]; then
    say "OK: LiveKit слушает 127.0.0.1:7880"
    exit 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    note "docker не найден, контейнер не пересоздать"
    exit 1
  fi

  if [[ "$listening" -eq 1 ]]; then
    note "Конфиг исправлен — пересоздаю LiveKit, чтобы он перечитал yaml"
  else
    note "LiveKit не отвечает на :7880 — пересоздаю контейнер"
  fi
  open_docker_to_host_7880
  recreate_livekit
  if wait_livekit; then
    note "LiveKit снова слушает 127.0.0.1:7880"
    rm -f "$COOLDOWN_FILE"
    exit 0
  fi

  note "FAIL: после пересоздания :7880 молчит. Логи:"
  (cd "$ROOT" && "${COMPOSE[@]}" logs livekit --tail 30) || true
  exit 1
}

case "$MODE" in
  self-test) self_test ;;
  install) install_timer ;;
  uninstall) uninstall_timer ;;
  fix-config) run_fix_config ;;
  run) run_watch ;;
esac
