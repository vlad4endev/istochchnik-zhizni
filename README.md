# istochchnik_zhizni

Монорепозиторий с Flutter UI и Node.js/TypeScript API.

## Чтобы всё заработало (кратко)

### Локальный веб-сервис (рекомендуется: БД + API + веб в Docker)

Один стек: Postgres, Node API и Flutter web за **nginx** на одном порту для браузера — без отдельной настройки `API_BASE_URL` для LAN.

1. **Один раз:** `npm run quickstart` или `cp .env.example .env` и при необходимости `npm ci && npm run build`. В **`.env`** задайте **`DATABASE_URL`**:
   - **Всё локально:** строка с `db:5432` из `.env.example` (Postgres поднимается вместе с compose).
   - **Supabase:** URI из Supabase (pooler **5432**), `?sslmode=require`, плюс `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=false`, `SKIP_DB_INIT_ON_START=true`.
2. **Запуск:** `docker compose up -d --build` (или `npm run prod:start`). Первый раз дольше — собирается образ Flutter web.
3. **Откройте в браузере:** [http://localhost:8080](http://localhost:8080) — интерфейс. Запросы к API идут на **тот же хост** (`/api/...`, прокси в nginx).
4. **Проверки:** [http://localhost:8080/health](http://localhost:8080/health) (через nginx) и при необходимости прямой API: [http://localhost:40978/health](http://localhost:40978/health).

Порт веба меняется переменной **`WEB_PORT`** в `.env`. Только API и БД без nginx: `docker compose up -d db api`.

### Разработка без Docker (Flutter + API в терминале)

- `npm run dev:start` — Flutter в Chrome и API в фоне.
- Для Vercel задайте **`API_BASE_URL`** в настройках проекта (см. ниже).

Если API не стартует — проверьте **`DATABASE_URL`** в **`.env`** и доступность базы.

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

## Project Docs

- [Logo and icon guidelines](docs/logo-guidelines.md)

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
   Локально / без ограничения API на loopback: `npm run prod:start` или `docker compose up -d --build`. Остановка этого режима: `npm run prod:stop`. Остановка после `prod:deploy`: `npm run prod:deploy:down`.
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

- **Веб-интерфейс:** `http://localhost:8080` (или `WEB_PORT` из `.env`) — nginx отдаёт Flutter и проксирует `/api` и `/health` к API.
- API напрямую: `http://localhost:40978`
- Health: `http://localhost:8080/health` или `http://localhost:40978/health`
- Корень API: `http://localhost:40978/` (JSON «Server is running»)
- База данных: внутри Docker-сети на хосте `db:5432`

### Portainer: production workflow (Supabase + API + Web)

Варианты:

- **Один стек (API + веб, сборка Flutter на сервере):** `docker-compose.portainer.stack.yml` — удобно, если на VPS хватает RAM/CPU под `flutter build`.
- **Два стека (надёжно на слабом VPS):**
  1. **API** — `docker-compose.portainer.yml` (секреты только через Environment в Portainer).
  2. **Только nginx + готовая папка** — `docker-compose.portainer.web-runtime.yml` (без `flutter build` на сервере; соберите web локально и залейте в `WEB_DIST_PATH`).

Это позволяет избежать частых падений сборки Flutter на слабом VPS.

#### API stack variables (Portainer)

```env
PORT=40978
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
DB_DEBUG_LOG=false
SKIP_DB_INIT_ON_START=true
AUTH_SESSION_TTL_DAYS=30
AUTH_MAX_ACTIVE_SESSIONS_PER_USER=5
```

#### Web runtime deployment

1) Локально соберите Flutter web:

```bash
flutter pub get
flutter build web --release --dart-define=API_BASE_URL=http://<SERVER_IP>:40978
```

2) Скопируйте артефакты на сервер в `WEB_DIST_PATH` (например, `/opt/istochik-web`):

```bash
rsync -av --delete build/web/ user@<SERVER_IP>:/opt/istochik-web/
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

## Flutter Web and API URL

Во Flutter убран хардкод `localhost:40978`; теперь используется `API_BASE_URL` через `--dart-define`.

### Локальный запуск Flutter с внешним API

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:40978
```

### Build Flutter web для продакшена

```bash
flutter build web --release --dart-define=API_BASE_URL=https://your-api-domain.com
```

### Деплой фронтенда на Vercel

На Vercel публикуется **только Flutter web** (статический `build/web`). **Node API** должен быть уже развёрнут отдельно (Docker, Railway, Render, VPS и т.д.) и доступен по HTTPS.

**Важно:** точка входа API в репозитории — `src/main.ts`, не `src/index.ts`. Vercel автоматически подключает Express, если найден `src/index.ts`, и тогда вместо Flutter отдаётся serverless API (в логах будет `[db] DATABASE_URL is not set` на `GET /`).

1. Подключите репозиторий к [Vercel](https://vercel.com).
2. В **Settings → Environment Variables** добавьте **`API_BASE_URL`** (полный URL API без слэша в конце). **Обязательно** отметьте окружения **Production** и **Preview** (деплой с ветки `main` — Production; PR и другие ветки — Preview; если у переменной только Production, сборка Preview упадёт с «API_BASE_URL не задана»). Сохраните и сделайте **Redeploy**.
3. Сборка задаётся в `vercel.json`: `scripts/vercel-build.sh` ставит Flutter stable и выполняет `flutter build web --release`.
4. После деплоя проверьте сайт; в браузере не должно быть обращений к `localhost` (иначе в билде не подставился `API_BASE_URL`).

**CORS:** API использует открытый `cors()` — запросы с домена Vercel обычно проходят. Если ограничите CORS на бэкенде, добавьте origin вида `https://<проект>.vercel.app`.

**Белый экран после деплоя:** сборка на Vercel использует `--no-web-resources-cdn`, чтобы CanvasKit не загружался с CDN Google (в части сетей он недоступен — тогда интерфейс не поднимается). После правок сделайте redeploy. В DevTools → Network проверьте, что нет массовых 404 по `main.dart.js` / `flutter_bootstrap.js`.

**Логи Vercel:** строка `Woah! You appear to be trying to run flutter as root` — ожидаемо на их сборщике; на результат не влияет. Сообщение `flutter pub outdated` — только напоминание про новые версии пакетов, не ошибка.

**Дальше (чеклист):**

1. **Два разных URL:** в браузере для приложения — домен **Vercel** (`https://….vercel.app`). Ответ `{"message":"Server is running"}` — это только **API**; интерфейс там не откроется.
2. Локальная проверка «как на Vercel» перед пушем:
   ```bash
   export API_BASE_URL=https://ваш-реальный-api
   bash scripts/vercel-build.sh
   ```
   затем можно открыть `build/web/index.html` через любой статический сервер или задеплоить снова.
3. **HTTPS:** с страницы Vercel (https) браузер блокирует запросы к **http**-API; для прода у API нужен HTTPS или прокси с TLS.
4. После `git push` в `main` GitHub Actions (`.github/workflows/flutter-web.yml`) проверит, что веб-сборка собирается.

## Локальный запуск всех сервисов в фоне

```bash
npm run dev:start      # API + Flutter в фоне
npm run dev:status     # статус фоновых процессов
npm run dev:logs       # последние логи API и Flutter
npm run dev:restart    # перезапуск в фоне
npm run dev:stop       # остановка всех dev-служб
```

Для запуска в текущем терминале (не в фоне):

```bash
npm run dev:start:fg
```
