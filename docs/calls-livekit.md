# Аудио- и видеозвонки (LiveKit)

Система звонков «Источник жизни» использует self-hosted **LiveKit Server** для медиа и Express API для жизненного цикла, прав доступа и истории.

## Компоненты

| Слой | Назначение |
|------|------------|
| React PWA (`web-react/src/features/calls`) | UI личных/групповых звонков, pre-join, входящий вызов |
| Express API (`/api/calls`, `/api/call-invitations`) | Создание, accept/decline/cancel/end, токены, приглашения |
| LiveKit Server | Аудио/видео комнаты |
| PostgreSQL | `calls`, `call_participants`, `call_invitations` |
| WebSocket `/api/realtime` | События жизненного цикла (без LiveKit-токенов) |
| Web Push + `custom-sw.js` | Уведомления о входящем при закрытой PWA |

## Переменные окружения

```bash
# LiveKit в bridge-сети compose — Docker DNS:
LIVEKIT_URL=http://livekit:7880
# Публичный WSS для браузера — тот же origin SPA + /lk (прокси в nginx-web.unified.conf):
LIVEKIT_PUBLIC_URL=wss://app.church-tambov.ru/lk
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...                   # только сервер
CALLS_ENABLED=true
CALL_RING_TIMEOUT_SEC=60
CALL_TOKEN_TTL_SEC=900
CALL_INVITE_TTL_HOURS=24
CALL_MAX_GROUP_PARTICIPANTS=50
PUBLIC_WEB_ORIGIN=https://app.church-tambov.ru   # invite URL + fallback для LIVEKIT_PUBLIC_URL
```

Frontend (build-arg / `.env` при сборке образа `web`):

```bash
VITE_CALLS_ENABLED=true
```

Не добавляйте `LIVEKIT_API_*` в `VITE_*`.

## Docker

```bash
bash scripts/check-livekit-env.sh   # ключи в .env обязательны
bash scripts/repair-livekit.sh      # recreate + curl :7880 и /lk
# или:
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d --build --force-recreate livekit api web
```

Образ зафиксирован: `livekit/livekit-server:v1.8.4` (см. `docker-compose.livekit-addon.yml`).  
Entrypoint: `docker/livekit-entrypoint.sh` (собирает `LIVEKIT_KEYS` с пробелом после `:`).

Конфиг: `docker/livekit.yaml`.  
WSS на том же домене SPA: location `/lk/` в `docker/nginx-web.unified.conf`.  
Опционально отдельный хост: `deploy/nginx-call.church-tambov.ru.example.conf`.

### Сеть и DNS

LiveKit в addon работает в **`network_mode: host`** (рекомендация LiveKit для Docker/NAT): UDP не идёт через docker-proxy, в ICE есть и белый IP, и LAN `192.168.x` (звонки в одной Wi‑Fi без hairpin).

1. Браузер: `LIVEKIT_PUBLIC_URL=wss://app…/lk` → nginx web → `livekit:7880` (Docker DNS).
2. На роутере → LAN IP хоста (напр. `192.168.1.203`):
   | Порт | Протокол | Назначение |
   |------|----------|------------|
   | 7881 | TCP | ICE/TCP |
   | 7882 | UDP | ICE/UDP mux |
   | 7880 | — | **не открывать** |
3. Хост: `"userland-proxy": false` + `deploy/sysctl-livekit.conf` → `/etc/sysctl.d/` + `sysctl --system`.
4. Белый IP: `LIVEKIT_RTC_NODE_IP` → `NODE_IP` (`use_external_ip: false` в v1.8.4).
5. TURN по умолчанию выключен в `docker/livekit.yaml`.
6. CGNAT без белого IP → VPS или внешний TURN.
7. Permissions-Policy: `camera=(self), microphone=(self)`.

### Проверка, что `/lk` — это LiveKit, а не SPA

```bash
# Ожидание: HTTP 200, короткое тело (OK), НЕ 500/502 и НЕ index.html ~29KB.
curl -sI https://app.church-tambov.ru/lk/ | head -20
curl -s https://app.church-tambov.ru/lk/; echo

# LiveKit на localhost (проброс 127.0.0.1:7880) и в Docker DNS:
curl -sS http://127.0.0.1:7880/; echo
docker exec istochnik-web wget -qO- -T 3 http://livekit:7880/; echo
docker exec istochnik-api node -e "fetch('http://livekit:7880/').then(r=>r.text()).then(console.log)"

docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml ps
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml logs livekit --tail 80
```

- `502`/`504` на `/lk/` / `curl 127.0.0.1:7880` connection refused → LiveKit не запустился. Частые причины:
  1. В `docker/livekit.yaml` поля не из v1.8.4 (`advertise_internal_ip` / `skip_external_ip_validation`) → `could not parse config`
  2. `LIVEKIT_KEYS` без пробела после `:` (нужно `KEY: SECRET`)
  3. Пустые `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` в `.env` — `bash scripts/check-livekit-env.sh`
  4. Стек без `docker-compose.livekit-addon.yml`  
  Поднять с **обоими** `-f`:  
  `docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d --force-recreate livekit`
- Сообщение UI «Сервис звонков временно недоступен» = API не смог `createRoom` (тот же 502 / LiveKit down / неверные ключи).
- `text/html` ~29KB → старый образ web без location `/lk/`.
- WSS ок, но «Переподключение…» / нет медиа → UDP **7882** + TCP **7881** + UDP **3478** + UDP **50100** на роутере + `userland-proxy: false`.

## API (кратко)

- `POST /api/calls` — `{ type: 'direct'|'group', mediaType, conversationId, recipientId? }`
- `POST /api/calls/:id/accept|decline|cancel|end`
- `POST /api/calls/:id/token` — краткоживущий JWT LiveKit после проверок
- `POST /api/calls/:id/invitations` / `DELETE .../invitations/:invitationId`
- `GET /api/call-invitations/:token` — preview без секретов LiveKit
- `POST /api/call-invitations/:token/join`
- `GET /api/calls/history`

Токены выдаются только участникам с правом доступа. Identity: `member:{id}`.

## Приглашения

Ссылка вида `https://app.church-tambov.ru/call/join/<opaque-token>`.

- В БД хранится **SHA-256 хеш** секрета, не сам секрет.
- Ссылка ≠ LiveKit token; перед join backend проверяет срок, отзыв, лимит, членство (closed) и состояние конференции.
- По умолчанию `access_mode = closed` (только участники группы).

## История в чате

Системные сообщения: `sender_id = NULL`, `payload.kind = 'call_event'`.

## Входящий звонок: Capacitor vs PWA

| Клиент | Как выглядит входящий |
|--------|------------------------|
| **Capacitor Android** | Data-only FCM → системный **CallStyle** + full-screen intent (как телефонный вызов). Foreground — полноэкранный overlay в WebView. |
| **Capacitor iOS** | **PushKit VoIP** → **CallKit** (нужны `APNS_*` ключи на сервере + VoIP capability). Foreground — overlay в WebView. |
| **PWA / браузер** | Web Push + toast/overlay; на iOS PWA нет «телефонного» звонка в фоне |

Сервер: `sendIncomingCallWake` (TTL ≈ `CALL_RING_TIMEOUT_SEC`). При cancel / miss уходит `call_ended` data-push, чтобы снять системный UI.

VoIP-токены: таблица `device_voip_tokens`, клиент `POST /api/notifications/save-voip-token`.

APNs VoIP (сервер):

```bash
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_P8_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
APNS_BUNDLE_ID=com.istochnikzhizni.molitva
APNS_PRODUCTION=true   # false для sandbox
```

Push **не** содержит LiveKit token. Успешная отправка ≠ доставка или принятие.

### Ограничения PWA

| Платформа | Ожидание |
|-----------|----------|
| Android (установленная PWA) | Web Push обычно доставляет входящий; фон ограничен Doze/оптимизацией батареи |
| iPhone (PWA на Home Screen, iOS 16.4+) | Web Push возможен после разрешения; фоновое ringtone и авто-ответ — **нет** |
| Desktop Chrome/Edge/Firefox | Web Push при открытой ОС и разрешении |

Демонстрация экрана: desktop через LiveKit; на iOS/Android в фоне — не поддерживается браузерами.

На Android OEM с агрессивной оптимизацией батареи CallStyle может задерживаться — исключите приложение из оптимизации.

## Проверка вручную

1. Два пользователя в личном чате, `CALLS_ENABLED` и `VITE_CALLS_ENABLED`.
2. Аудио/видеозвонок → входящий (Realtime + Push) → accept → медиа.
3. Группа → начать конференцию → скопировать ссылку → join с другого аккаунта.
4. Пропущенный (не отвечать > ring timeout) → история «Пропущенный вызов».

Автотесты без реального медиа: `npm test` (unit для LiveKit helpers / invite hash).
