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

### 2) Запуск контейнеров

```bash
docker compose up -d --build
```

После запуска:
- API: `http://localhost:3000`
- Health route: `http://localhost:3000/`
- База данных: внутри Docker-сети на хосте `db:5432`

### 3) Остановка

```bash
docker compose down
```

Чтобы удалить volume с данными Postgres:

```bash
docker compose down -v
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
