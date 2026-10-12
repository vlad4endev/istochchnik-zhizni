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
LIVEKIT_URL=http://livekit:7880          # внутренний URL для API (docker DNS)
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
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d --build
```

Образ зафиксирован: `livekit/livekit-server:v1.8.4` (см. `docker-compose.livekit-addon.yml`).

Конфиг: `docker/livekit.yaml`.  
WSS на том же домене SPA: location `/lk/` в `docker/nginx-web.unified.conf`.  
Опционально отдельный хост: `deploy/nginx-call.church-tambov.ru.example.conf`.

### Сеть и DNS

LiveKit в addon работает в **`network_mode: host`** (рекомендация LiveKit для Docker/NAT): UDP не идёт через docker-proxy, в ICE есть и белый IP, и LAN `192.168.x` (звонки в одной Wi‑Fi без hairpin).

1. Браузер: `LIVEKIT_PUBLIC_URL=wss://app…/lk` → nginx web → `host.docker.internal:7880`.
2. На роутере → LAN IP хоста (напр. `192.168.1.203`), **все порт→порт**:
   | Порт | Протокол | Назначение |
   |------|----------|------------|
   | 7881 | TCP | ICE/TCP |
   | 7882 | UDP | ICE/UDP mux |
   | 3478 | UDP | TURN |
   | 50100 | UDP | TURN relay (один порт, без диапазона) |
   | 7880 | — | **не открывать** |
3. Хост: `"userland-proxy": false` + `deploy/sysctl-livekit.conf` → `/etc/sysctl.d/` + `sysctl --system`.
4. Встроенный TURN (`turn.enabled` в `docker/livekit.yaml`, domain=`app.church-tambov.ru`).
5. CGNAT без белого IP → VPS или внешний TURN.
6. Permissions-Policy: `camera=(self), microphone=(self)`.

### Проверка, что `/lk` — это LiveKit, а не SPA

```bash
# Ожидание: HTTP 200, короткое тело (OK), НЕ 500 и НЕ index.html ~29KB.
curl -sI https://app.church-tambov.ru/lk/ | head -20
curl -s https://app.church-tambov.ru/lk/; echo

# LiveKit доступен из web по docker DNS (если пусто/ошибка — сеть compose разъехалась):
docker exec istochnik-web wget -qO- http://livekit:7880/ || docker exec istochnik-web ping -c1 livekit
docker exec istochnik-web grep -A3 'livekit_signal\|location ^~ /lk/' /etc/nginx/conf.d/default.conf

# Логи прокси:
docker logs istochnik-web --tail 50
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml logs livekit --tail 50
```

- `500`/`502` на `/lk/` → web не видит контейнер `livekit` (поднимите стек с **обоими** `-f` и `up -d --build --force-recreate web livekit`).
- `text/html` ~29KB → старый образ web без location `/lk/`.
- WSS ок, но «Переподключение…» / нет медиа → host network + UDP **7882** + TCP **7881** + `userland-proxy: false`.
- После смены addon: `up -d --build --force-recreate livekit api web` (web нужен из‑за nginx upstream).

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

## Ограничения Web Push / PWA

| Платформа | Ожидание |
|-----------|----------|
| Android (установленная PWA) | Web Push обычно доставляет входящий; фон ограничен Doze/оптимизацией батареи |
| iPhone (PWA на Home Screen, iOS 16.4+) | Web Push возможен после разрешения; фоновое выполнение и авто-ответ — **нет**; нет «телефонного» звонка в фоне |
| Desktop Chrome/Edge/Firefox | Web Push при открытой ОС и разрешении; зависит от настроек браузера |

Push **не** содержит LiveKit token. Успешная отправка ≠ доставка или принятие.

Демонстрация экрана: desktop через LiveKit; на iOS/Android в фоне — не поддерживается браузерами.

## Проверка вручную

1. Два пользователя в личном чате, `CALLS_ENABLED` и `VITE_CALLS_ENABLED`.
2. Аудио/видеозвонок → входящий (Realtime + Push) → accept → медиа.
3. Группа → начать конференцию → скопировать ссылку → join с другого аккаунта.
4. Пропущенный (не отвечать > ring timeout) → история «Пропущенный вызов».

Автотесты без реального медиа: `npm test` (unit для LiveKit helpers / invite hash).
