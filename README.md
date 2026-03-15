# istochchnik_zhizni

Монорепозиторий с Flutter UI и Node.js/TypeScript API.

## Project Docs

- [Logo and icon guidelines](docs/logo-guidelines.md)

## Docker Deployment (API + Postgres)

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

- API: `http://localhost:3000`
- Health route: `http://localhost:3000/`
- База данных: внутри Docker-сети на хосте `db:5432`

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

Во Flutter убран хардкод `localhost:3000`; теперь используется `API_BASE_URL` через `--dart-define`.

### Локальный запуск Flutter с внешним API

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

### Build Flutter web для продакшена

```bash
flutter build web --release --dart-define=API_BASE_URL=https://your-api-domain.com
```

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
