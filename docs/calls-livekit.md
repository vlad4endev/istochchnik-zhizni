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
LIVEKIT_URL=http://livekit:7880          # внутренний URL для API
LIVEKIT_PUBLIC_URL=wss://call.church-tambov.ru
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...                   # только сервер
CALLS_ENABLED=true
CALL_RING_TIMEOUT_SEC=60
CALL_TOKEN_TTL_SEC=900
CALL_INVITE_TTL_HOURS=24
CALL_MAX_GROUP_PARTICIPANTS=50
PUBLIC_WEB_ORIGIN=https://app.church-tambov.ru   # для абсолютных invite URL
```

Frontend:

```bash
VITE_CALLS_ENABLED=true
```

Не добавляйте `LIVEKIT_API_*` в `VITE_*`.

## Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d
```

Образ зафиксирован: `livekit/livekit-server:v1.8.4` (см. `docker-compose.livekit-addon.yml`).

Конфиг: `docker/livekit.yaml`.  
Пример nginx WSS: `deploy/nginx-call.church-tambov.ru.example.conf`.

### Сеть и DNS

1. DNS: `call.church-tambov.ru` → IP сервера.
2. HTTPS/WSS на 443 → `127.0.0.1:7880` (LiveKit signal).
3. **UDP 50000–50100** и **TCP 7881** должны быть доступны из интернета для WebRTC.
4. Если сервер за **CGNAT**, проброс UDP с домашнего роутера не сработает — нужен VPS с белым IP, туннель или внешний TURN.
5. Админский API LiveKit не выставляйте в интернет напрямую (порт 7880 на loopback).

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
