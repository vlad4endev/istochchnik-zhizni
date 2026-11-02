# Операции: запуск, деплой, бэкапы

Подробные инструкции по развёртыванию и обслуживанию. Краткий старт — в [корневом README](../README.md).

## Локальный стек (Docker)

Один стек: Postgres, Node API и статика **web-react** за **nginx** на одном порту — без отдельной настройки `VITE_API_BASE_URL` для LAN (запросы на тот же origin, `/api` в nginx).

1. **Один раз:** `npm run quickstart` или `cp .env.example .env` и при необходимости `npm ci && npm run build`. В **`.env`** задайте **`DATABASE_URL`**:
   - **Всё локально:** строка с `db:5432` из `.env.example` (Postgres поднимается вместе с compose).
   - **Supabase:** URI из Supabase (pooler **5432**), `?sslmode=require`, плюс `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=false`, `SKIP_DB_INIT_ON_START=true`.
2. **Запуск:** `docker compose up -d --build` (или `npm run prod:start`). Собирается образ **`Dockerfile.web`** (Vite → nginx).
3. **Откройте:** [http://localhost:8080](http://localhost:8080). API и health — на том же хосте (`/api/...`, `/health`).
4. **Проверки:** [http://localhost:8080/health](http://localhost:8080/health) и при необходимости [http://localhost:40978/health](http://localhost:40978/health).

Порт веба — **`WEB_PORT`** в `.env`. Только API и БД: `docker compose up -d db api`.

## Разработка без Docker

- `npm run start-all` или `npm run dev:start:fg` — API и Vite в одном терминале.
- `npm run dev:start` — то же в фоне (лог `.run/dev-bg.log`).
- `npm run go:start` — API + Vite + при необходимости `db:up` (см. `scripts/project.sh`).

Если API не стартует — проверьте **`DATABASE_URL`** в **`.env`**.

### Фоновые dev-команды

```bash
npm run dev:start      # API + Vite в фоне
npm run dev:status
npm run dev:logs
npm run dev:restart
npm run dev:stop
npm run dev:start:fg   # в текущем терминале
```

## Готовая статика без сборки Node на сервере

На слабом VPS соберите фронт локально и залейте **`release/web/`**:

```bash
bash scripts/package-web-for-server.sh
# скопируйте release/web/ на сервер, затем:
npm run prod:deploy:prebuilt
```

Используются **`Dockerfile.web.prebuilt`** и **`docker-compose.web-prebuilt.yml`**.

## Supabase: типичные ошибки

### `Circuit breaker open` или ошибка на порту 6543

В Dashboard **Connect → Connection string** выберите **Session pooler** и порт **5432**, не **Transaction pooler** (6543). Скопируйте URI в `DATABASE_URL` (пользователь `postgres.<project-ref>`, `?sslmode=require`).

### `invalid sslmode value`

Должно быть полностью **`sslmode=require`**.

### `SELF_SIGNED_CERT_IN_CHAIN`

Задайте **`DB_SSL_REJECT_UNAUTHORIZED=false`** в окружении контейнера.

### Расхождение истории миграций

```bash
set -a && source .env && set +a
npx supabase@latest migration repair <VERSION> --status reverted --db-url "$DATABASE_URL"
npx supabase@latest db pull --db-url "$DATABASE_URL"
npx supabase@latest db push --db-url "$DATABASE_URL"
# или: ./scripts/supabase-db-push.sh
```

Версия — число `YYYYMMDDHHMMSS` из текста ошибки CLI.

## Web Push / VAPID

```bash
npm run push:vapid
# или: npx web-push generate-vapid-keys
```

В backend `.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-support@domain.com
```

**Чтобы push не ломался после передеплоя:**

- Если `VAPID_*` не заданы, API один раз создаёт пару ключей и хранит её в БД (`push_server_keys`), так что подписки браузеров переживают пересоздание стека. Явные переменные окружения имеют приоритет. Смена пары ключей отключает все существующие подписки (клиенты пересоздают их сами при следующем открытии).
- Android/iOS (FCM): `secrets/firebase-sa.json` не в git и монтируется как `./secrets`; при деплое из git (Portainer) каталог может оказаться пустым. Надёжнее задать `FIREBASE_SERVICE_ACCOUNT_JSON` в переменных стека. В логе старта API ищите строку `[push] FCM configured` / `FCM NOT configured`.

## Аудио/видеозвонки (LiveKit)

Подробно: [`calls-livekit.md`](./calls-livekit.md).

```bash
# В .env: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_PUBLIC_URL, CALLS_ENABLED=true
# Frontend: VITE_CALLS_ENABLED=true
docker compose -f docker-compose.yml -f docker-compose.livekit-addon.yml up -d
```

Нужны DNS `call.church-tambov.ru` (WSS), UDP **50000–50100** и TCP **7881**.

## Бекап (БД + uploads)

```bash
npm run backup
npm run backup:list
npm run backup:verify -- backups/latest
bash scripts/restore.sh backups/latest
CONFIRM_RESTORE=YES bash scripts/restore.sh backups/latest
```

На проде: `BACKUP_BEFORE_UPDATE=1`, по возможности `BACKUP_ENCRYPT_PASSPHRASE`. В админке: **Система → Резервная копия**. Подробности: [backup.md](./backup.md).

### Нулевой деплой и участники

`initDb` поднимает только схему. Список участников **не** заливается из кода при старте API
(раньше `MEMBER_SEED_SQL` снова создавал удалённых людей после пересборки).

- Пустой сервер → пустая `members` → либо restore из бэкапа, либо ручное добавление.
- Явный сид из репозитория (если нужен): `npm run db:seed-members` или `SEED_MEMBERS_ON_INIT=true`.

## Обновление на сервере

```bash
npm run server:update
# или: bash scripts/server-update.sh
```

Скрипт: опциональный бекап → `git pull --ff-only` → пересборка Docker → миграции → health-check. Лог: `.run/updates/`.

Полезные флаги: `BACKUP_BEFORE_UPDATE=1`, `USE_PROD_OVERLAY=1`, `PREBUILT_WEB=1`, `HOST_BUILD=1`, `RUN_SUPABASE_PUSH=1`, `SKIP_MIGRATE=1`, `OFFLINE=1`, `SKIP_DOCKER=1`, `SKIP_BACKUP=1`.

## Продакшен на VPS

1. Docker + Compose v2, открыт порт **`WEB_PORT`** (по умолчанию 8080).
2. `git clone` → `cp .env.example .env` → **`DATABASE_URL`**.
3. Запуск с API только на loopback:

   ```bash
   npm run prod:deploy
   # или: bash scripts/deploy-production.sh
   ```

   Обновления: `npm run server:update`. Локально без overlay: `npm run prod:start`. Только Postgres + API: `npm run prod:vps:up`.
4. Проверка: `http://<IP>:<WEB_PORT>/` и `/health`.
5. HTTPS: Caddy / Traefik / nginx → `127.0.0.1:<WEB_PORT>`.
6. **`PORT` в `.env`** — порт на хосте → контейнер **40978**.

### Быстрые прод-команды

```bash
npm run prod:start
npm run prod:status
npm run prod:logs
npm run prod:restart
npm run prod:stop
npm run prod:fresh
```

### Portainer (Supabase + API + Web)

- Один стек: `docker-compose.portainer.stack.yml`
- Два стека: `docker-compose.portainer.yml` (API) + `docker-compose.portainer.web-runtime.yml` (nginx + `release/web/`)

Пример переменных API:

```env
PORT=40978
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
SKIP_DB_INIT_ON_START=true
```

Web runtime: задайте `WEB_DIST_PATH` (например `/opt/istochik-web`) в `.env` / Portainer.
Тогда `npm run server:update` сам соберёт `web-react` и сделает `rsync` в этот каталог
(иначе volume mount продолжает отдавать старый фронт после `docker compose build web`).

Вручную: `bash scripts/package-web-for-server.sh` (подхватит `WEB_DIST_PATH` из `.env`) →
перезапуск контейнера `web`.

## React: URL API при сборке

В **web-react** базовый URL — **`VITE_API_BASE_URL`** на этапе сборки. В dev можно не задавать: Vite проксирует `/api` на бэкенд.

```bash
cd web-react
VITE_API_BASE_URL=https://your-api-domain.com npm run build
```

GitHub Actions (`.github/workflows/web-react.yml`) проверяет сборку на `main`.

### Push: сервер не видит fcm.googleapis.com

Симптом: `curl -4 https://fcm.googleapis.com/` с хоста — таймаут, в логах API «Socket timeout» при отправке FCM / Web Push на Android.
Решение — исходящий HTTP(S)-прокси только для Google: `PUSH_PROXY_URL=http://user:pass@host:port` в `.env` (по умолчанию через него идёт `*.googleapis.com`; `PUSH_PROXY_ALL=1` — весь push-трафик). Применяется к web-push и firebase-admin.
