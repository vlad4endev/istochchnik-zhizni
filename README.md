# istochchnik_zhizni

Монорепозиторий: **React (Vite)** в `web-react/` и **Node.js/TypeScript API** в `src/`.

## Чтобы всё заработало (кратко)

### Локальный веб-сервис (рекомендуется: БД + API + веб в Docker)

Один стек: Postgres, Node API и статика **web-react** за **nginx** на одном порту для браузера — без отдельной настройки `VITE_API_BASE_URL` для LAN (запросы на тот же origin, `/api` в nginx).

1. **Один раз:** `npm run quickstart` или `cp .env.example .env` и при необходимости `npm ci && npm run build`. В **`.env`** задайте **`DATABASE_URL`**:
   - **Всё локально:** строка с `db:5432` из `.env.example` (Postgres поднимается вместе с compose).
   - **Supabase:** URI из Supabase (pooler **5432**), `?sslmode=require`, плюс `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=false`, `SKIP_DB_INIT_ON_START=true`.
2. **Запуск:** `docker compose up -d --build` (или `npm run prod:start`). Собирается образ **`Dockerfile.web`** (Vite → nginx).
3. **Откройте в браузере:** [http://localhost:8080](http://localhost:8080) — интерфейс. Запросы к API идут на **тот же хост** (`/api/...`, прокси в nginx).
4. **Проверки:** [http://localhost:8080/health](http://localhost:8080/health) (через nginx) и при необходимости прямой API: [http://localhost:40978/health](http://localhost:40978/health).

Порт веба меняется переменной **`WEB_PORT`** в `.env`. Только API и БД без nginx: `docker compose up -d db api`.

### Разработка без Docker (React + API в терминале)

- `npm run start-all` или `npm run dev:start:fg` — API и Vite в одном терминале.
- `npm run dev:start` — то же в фоне (лог `.run/dev-bg.log`).
- `npm run go:start` — API + Vite + при необходимости `db:up` (см. `scripts/project.sh`).

Для деплоя фронта на Vercel задайте **`VITE_API_BASE_URL`** или **`API_BASE_URL`** (см. ниже).

Если API не стартует — проверьте **`DATABASE_URL`** в **`.env`** и доступность базы.

### Готовая статика без сборки Node в Docker на сервере

На слабом VPS надёжно собрать фронт локально и залить **`release/web/`**:

```bash
bash scripts/package-web-for-server.sh
# скопируйте release/web/ на сервер, затем:
npm run prod:deploy:prebuilt
```

Используются **`Dockerfile.web.prebuilt`** и **`docker-compose.web-prebuilt.yml`**.

### Supabase: `Circuit breaker open` или ошибка на порту 6543

В Dashboard **Connect → Connection string** выберите **Session pooler** и порт **5432**, не **Transaction pooler** (6543). Скопируйте URI в `DATABASE_URL` (пользователь `postgres.<project-ref>`, `?sslmode=require`). Transaction pooler с 6543 может отдавать `Circuit breaker open` при миграциях и `psql` — это не пароль и не ваш сервер, а режим pooler.

### `invalid sslmode value` / `sslmode is invalid`

Должно быть полностью **`sslmode=require`**, не `requir` и не обрезанная строка при копировании. Проверьте конец `DATABASE_URL` в `.env`.

### `SELF_SIGNED_CERT_IN_CHAIN` в логах API (Docker + Supabase)

Задайте **`DB_SSL_REJECT_UNAUTHORIZED=false`** в окружении контейнера (или пересоберите образ с обновлённым `src/config/db.ts`: по умолчанию проверка цепочки CA отключена, пока явно не задано `true`). Без этого Node/pg отклоняет TLS к pooler Supabase.

### Расхождение истории миграций (`migration repair`, `db pull`)

Если `supabase db push` ругается на уже применённые версии или «битую» таблицу истории на удалённой БД:

1. Обновите репозиторий: `git pull`.
2. Подставьте **номер версии из текста ошибки CLI** (формат `YYYYMMDDHHMMSS`, не имя файла). В репозитории может не быть файла с этим префиксом — тогда версия записана только в удалённой БД.
3. Пометить миграцию как откатанную (чтобы можно было синхронизировать историю). Версия — число из ошибки CLI, **первым аргументом** после `repair`:

   ```bash
   set -a && source .env && set +a
   npx supabase@latest migration repair <VERSION> --status reverted --db-url "$DATABASE_URL"
   ```

4. Подтянуть схему с удалённой БД в локальные миграции (осторожно: создаст/изменит файлы — сделайте коммит или копию ветки до этого):

   ```bash
   npx supabase@latest db pull --db-url "$DATABASE_URL"
   ```

5. Снова `npx supabase@latest db push --db-url "$DATABASE_URL"` или `./scripts/supabase-db-push.sh`.

### Web Push / VAPID keys

Бэкенд использует переменные `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (см. `src/services/pushService.ts`).  
Если в логах есть `VAPID keys are not configured`, сгенерируйте ключи:

```bash
npm run push:vapid
```

Альтернатива:

```bash
npx web-push generate-vapid-keys
```

Вставьте значения в backend `.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-support@domain.com
```

После обновления `.env` перезапустите API.

## Project Docs

- [Logo and icon guidelines](docs/logo-guidelines.md)

## Обновление на сервере (одна команда)

Из каталога клона на VPS:

```bash
npm run server:update
# или: bash scripts/server-update.sh
# или: npm run go:update
```

Скрипт `scripts/server-update.sh`:
1. `git pull --ff-only` (сбрасывает локальные правки `package*.json`, мешающие merge)
2. пересобирает образы и перезапускает Docker (`npm ci` внутри Dockerfile)
3. применяет миграции (`initDb` + media/song CLI), если возможно
4. ждёт health API/web и пишет лог в `.run/updates/`

Полезные флаги:
- `USE_PROD_OVERLAY=1` — overlay с API на loopback
- `PREBUILT_WEB=1` / `HOST_BUILD=1` — сборка фронта на хосте + `release/web/`
- `RUN_SUPABASE_PUSH=1` — дополнительно `supabase db push`
- `SKIP_MIGRATE=1`, `OFFLINE=1`, `SKIP_DOCKER=1` — точечные пропуски шагов

## Docker Deployment (API + Postgres)

### Продакшен на VPS (полный чеклист)

1. **Сервер:** Docker и Docker Compose v2, открыт в фаерволе порт **`WEB_PORT`** (по умолчанию 8080).
2. **Репозиторий и окружение:** `git clone` → `cp .env.example .env` → задать **`DATABASE_URL`**, для Supabase см. блоки выше (`DB_SSL`, `SKIP_DB_INIT_ON_START`).
3. **Запуск с закрытым API наружу** (API только на `127.0.0.1`, браузер ходит в nginx на `WEB_PORT`):
   ```bash
   npm run prod:deploy
   ```
   или
   ```bash
   bash scripts/deploy-production.sh
   ```
   **Последующие обновления** с GitHub: `npm run server:update` (или `USE_PROD_OVERLAY=1 npm run server:update`).
   Локально / без ограничения API на loopback: `npm run prod:start` или `docker compose up -d --build`. Остановка этого режима: `npm run prod:stop`. Остановка после `prod:deploy`: `npm run prod:deploy:down`.
   **Только Postgres + API** (SPA на Vercel/Netlify): `cp .env.production .env`, задайте `POSTGRES_PASSWORD` и `DATABASE_URL` с хостом `db`, затем `npm run prod:vps:up` (`docker-compose.prod.yml`). Остановка: `npm run prod:vps:down`.
4. **Проверка:** `http://<IP>:<WEB_PORT>/` — приложение; `http://<IP>:<WEB_PORT>/health` — health.
5. **HTTPS:** поставьте на хосте Caddy / Traefik / nginx с TLS и прокси на `127.0.0.1:<WEB_PORT>` (не публикуйте API напрямую в интернет).
6. **Переменная `PORT` в `.env`** — это порт **на хосте**, который пробрасывается **в** контейнер на **40978**. Внутри контейнера Node всегда слушает **40978** (так устроен прокси в `docker/nginx-web.unified.conf`).
7. **Portainer, одна БД снаружи (Supabase):** файл **`docker-compose.portainer.stack.yml`** — стек **API + веб** без Postgres; задайте `DATABASE_URL` и `WEB_PORT` в UI.

### 1) Подготовка переменных окружения

```bash
cp .env.example .env
```

При необходимости поменяйте значения в `.env`.

Для managed PostgreSQL (например Supabase) можно включить SSL:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
SKIP_DB_INIT_ON_START=true
```

### 2) Запуск контейнеров

```bash
docker compose up -d --build
```

Или одной npm-командой из корня проекта:

```bash
npm run prod:start
```

После запуска:

- **Веб-интерфейс:** `http://localhost:8080` (или `WEB_PORT` из `.env`) — nginx отдаёт сборку **web-react** и проксирует `/api` и `/health` к API.
- API напрямую: `http://localhost:40978`
- Health: `http://localhost:8080/health` или `http://localhost:40978/health`
- Корень API: `http://localhost:40978/` (JSON «Server is running»)
- База данных: внутри Docker-сети на хосте `db:5432`

### Portainer: production workflow (Supabase + API + Web)

Варианты:

- **Один стек (API + веб, сборка Vite в Docker):** `docker-compose.portainer.stack.yml` — образ `Dockerfile.web`.
- **Два стека (надёжно на слабом VPS):**
  1. **API** — `docker-compose.portainer.yml` (секреты только через Environment в Portainer).
  2. **Только nginx + готовая папка** — `docker-compose.portainer.web-runtime.yml` (соберите web локально и залейте в `WEB_DIST_PATH`).

#### API stack variables (Portainer)

```env
PORT=40978
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_DEBUG_LOG=false
SKIP_DB_INIT_ON_START=true
AUTH_SESSION_TTL_DAYS=30
AUTH_MAX_REFRESH_SESSIONS_PER_USER=15
AUTH_MAX_ACCESS_SESSIONS_PER_USER=30
```

#### Web runtime deployment

1) Локально соберите фронт:

```bash
bash scripts/package-web-for-server.sh
```

2) Скопируйте **`release/web/`** на сервер в `WEB_DIST_PATH` (например, `/opt/istochik-web`):

```bash
rsync -av --delete release/web/ user@<SERVER_IP>:/opt/istochik-web/
```

3) Разверните web runtime stack (`docker-compose.portainer.web-runtime.yml`) с переменными:

```env
WEB_PORT=8080
WEB_DIST_PATH=/opt/istochik-web
```

После деплоя:
- API: `http://<SERVER_IP>:40978`
- Web: `http://<SERVER_IP>:8080`

### 3) Остановка

```bash
docker compose down
```

Или:

```bash
npm run prod:stop
```

Чтобы удалить volume с данными Postgres:

```bash
docker compose down -v
```

### Быстрые прод-команды (все службы)

```bash
npm run prod:start    # разовый запуск/перезапуск всех служб в фоне
npm run prod:status   # статус контейнеров
npm run prod:logs     # логи всех служб
npm run prod:restart  # перезапуск всех служб
npm run prod:stop     # остановка всех служб
npm run prod:fresh    # полный пересоздание (с удалением volume БД)
```

## React (Vite) и URL API

В **web-react** базовый URL API задаётся переменной окружения **`VITE_API_BASE_URL`** на этапе сборки. Локально в dev можно не задавать: запросы идут на тот же origin, Vite проксирует `/api` на бэкенд (`vite.config.ts`).

### Сборка web-react для продакшена

```bash
cd web-react
VITE_API_BASE_URL=https://your-api-domain.com npm run build
```

Из корня: передайте переменную в окружении перед `npm run web:build`.

### Деплой фронтенда на Vercel

Публикуется статика **`web-react/dist`**. **Node API** должен быть развёрнут отдельно (Docker, Railway, Render, VPS и т.д.) и доступен по HTTPS.

**Важно:** точка входа API в репозитории — `src/main.ts`, не `src/index.ts`. Vercel автоматически подключает Express, если найден `src/index.ts`, и тогда вместо статики отдаётся serverless API.

1. Подключите репозиторий к [Vercel](https://vercel.com).
2. В **Settings → Environment Variables** добавьте **`API_BASE_URL`** или сразу **`VITE_API_BASE_URL`** (полный URL API без слэша в конце). Отметьте **Production** и **Preview**.
3. Сборка: `vercel.json` → `npm ci --prefix web-react`, затем `scripts/vercel-build.sh` (`npm run build` в `web-react`).
4. После деплоя проверьте сайт; в прод-сборке не должно остаться обращений к `localhost` вместо реального API.

**CORS:** API использует открытый `cors()` — запросы с домена Vercel обычно проходят. Если ограничите CORS на бэкенде, добавьте origin вида `https://<проект>.vercel.app`.

**Чеклист:**

1. В браузере приложение — домен **Vercel**; ответ `{"message":"Server is running"}` на URL API — это только бэкенд.
2. Локальная проверка сборки как на Vercel:
   ```bash
   export API_BASE_URL=https://ваш-реальный-api
   bash scripts/vercel-build.sh
   ```
3. **HTTPS:** со страницы Vercel (https) браузер блокирует запросы к **http**-API без прокси/TLS.

4. GitHub Actions (`.github/workflows/web-react.yml`) проверяет сборку `web-react` на `main`.

## Локальный запуск всех сервисов в фоне

```bash
npm run dev:start      # API + Vite в фоне
npm run dev:status     # статус фоновых процессов
npm run dev:logs       # последние логи
npm run dev:restart    # перезапуск в фоне
npm run dev:stop       # остановка всех dev-служб
```

Для запуска в текущем терминале (не в фоне):

```bash
npm run dev:start:fg
```
