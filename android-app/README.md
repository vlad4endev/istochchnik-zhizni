# Источник жизни — Android (React Native)

Офлайн-first Android-приложение с локальной SQLite (WatermelonDB) и синхронизацией через Express API (`/api/sync/*`).

## Структура

```
src/
  app/           Navigation, providers
  screens/       Auth, Songbook (MVP)
  components/ui/ RN UI kit (NativeWind)
  db/            WatermelonDB schema + models
  sync/          pull/push queue, NetInfo, background fetch
  repositories/  SongRepository, MemberRepository
  shared/        apiClient, auth, types, config
  theme/         design tokens from PWA
```

## Требования

- Node.js 20+
- Android Studio + SDK
- Запущенный backend API (порт 40978) и PostgreSQL

## Настройка

```bash
cd android-app
cp .env.example .env
npm install
```

`.env`:

```
API_BASE_URL=http://10.0.2.2:40978
```

`10.0.2.2` — localhost хост-машины из Android-эмулятора.

## Запуск

```bash
# Metro
npm start

# Android (другой терминал)
npm run android
```

## Синхронизация

- **Pull:** `GET /api/sync/pull?table=songs&since=ISO8601`
- **Push:** `POST /api/sync/push` с batch операций
- **Bootstrap:** `GET /api/sync/bootstrap` — начальный снимок каталога

Локальные изменения идут через `SongRepository` → SQLite → `sync_queue` → push при online.

## Сборка release AAB

1. Создайте keystore и настройте `android/gradle.properties` / `android/app/build.gradle` (signingConfigs).
2. Установите prod `API_BASE_URL` через `react-native-config` (`.env.production`).
3. `cd android && ./gradlew bundleRelease`

## Тесты

```bash
npm test
npm run typecheck
```
