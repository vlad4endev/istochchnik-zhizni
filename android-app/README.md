# Источник жизни — Android (React Native + WatermelonDB)

Офлайн-first Android-приложение с локальной SQLite (WatermelonDB) и синхронизацией через Express API (`/api/sync/*`). Package ID: `com.istochnikapp`.

## Что умеет

| Раздел | Офлайн | Sync |
|--------|--------|------|
| Песенник (CRUD) | SQLite | двусторонний `/api/sync` (bootstrap → pull/push) |
| Участники (профиль) | SQLite | pull |
| Лента церкви | локальный кэш | pull в кэш при sync (`/api/feed`) |
| Медиа-расписание | локальный кэш | pull в кэш (`/api/media-schedule/my-schedule`) |

Фоновая синхронизация: NetInfo (при появлении сети) + BackgroundFetch.

## Структура

```
src/
  app/           Navigation, tabs, providers
  screens/       Home, Songbook, Feed, Media, Auth, Settings
  components/ui/ RN UI kit (NativeWind)
  db/            WatermelonDB schema v2 + models + migrations
  sync/          bootstrap, pull/push queue, feature caches, NetInfo
  repositories/  Song, Member, FeedCache, MediaEventCache
  shared/        apiClient, auth, feed/media API, config
  theme/         design tokens from PWA
```

## Требования

- Node.js 20+
- JDK 17+ (21 OK)
- Android SDK (API 35) + platform-tools
- Backend API и PostgreSQL для live sync (прод: `https://app.church-tambov.ru`)

## Настройка

```bash
cd android-app
cp .env.example .env   # или используйте готовый .env с prod URL
npm install
```

`.env`:

```
# Эмулятор → хост-машина
API_BASE_URL=http://10.0.2.2:40978

# Или production
# API_BASE_URL=https://app.church-tambov.ru
```

## Запуск

```bash
npm start
npm run android
```

## Синхронизация

1. **Cold start:** `GET /api/sync/bootstrap` — снимок опубликованных песен + текущий member.
2. **Pull:** `GET /api/sync/pull?table=songs|members&since=&cursor=`
3. **Push:** `POST /api/sync/push` — batch операций по песням (members — read-only).
4. **Feature caches:** после core-sync подтягиваются лента и медиа-расписание в локальные таблицы.

Локальные правки песен: `SongRepository` → SQLite → `sync_queue` → push при online.

## Сборка APK / AAB

Standalone APK **должен** включать JS-бандл. Скрипт `android:apk` сначала делает
`react-native bundle`, затем `assembleRelease` — Metro для установки не нужен.

```bash
# Standalone release APK (armeabi-v7a + arm64-v8a), работает без Metro
npm run android:apk
# → android/app/build/outputs/apk/release/app-release.apk

# Только Metro-debug (для разработки: npm start + npm run android)
npm run android:apk:debug-metro

# Play Store AAB
npm run android:bundle
```

Для магазина: создайте upload keystore и настройте `signingConfigs.release` в `android/app/build.gradle` (не коммитьте секреты). Сейчас release подписан debug keystore — удобно для внутренней установки.

## Тесты

```bash
npm test
npm run typecheck
```

## Отличие от Capacitor APK

Веб-обёртка (`web-react/android`, `com.istochnikzhizni.molitva`) — online SPA с FCM/звонками.  
Этот клиент (`com.istochnikapp`) — нативный офлайн-first с локальной БД. Это **разные** приложения в магазине.
