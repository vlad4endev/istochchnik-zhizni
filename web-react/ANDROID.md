# Android APK = Phase 8 PWA (Capacitor) + офлайн БД

Приложение для Android — это **тот же `web-react`**, что и сайт/PWA, в Capacitor WebView.

- Package ID: `com.istochnikzhizni.molitva`
- Version: `1.2.0` (versionCode 11)
- UI — Phase 8 mobile design (`androidDesignTokens`, glass nav, auth hero, …)
- API: `https://app.church-tambov.ru`
- **Офлайн БД:** IndexedDB (Dexie) `istochnik_offline_v1` + feed cache `istochnik_feed_cache_v1`, синхронизация через `/api/sync`

## Как приложение получает данные

```
UI (web-react / Phase 8)
  → IndexedDB: songs, members, church_events, sermon_notes, outbox
  → IndexedDB feed cache (отдельная БД)
  ↔ HTTPS /api/sync/bootstrap|pull|push  (+ /api/songs, /api/feed …)
  → Express → PostgreSQL
```

1. После входа `OfflineSyncBridge` делает bootstrap и incremental pull/push.
2. Песенник онлайн прогревает локальный store; **офлайн** читает только IndexedDB.
3. Лента кэшируется отдельно и отдаётся без сети.
4. Локальные изменения уходят через outbox при появлении сети.

## Сборка standalone APK

```bash
cd web-react
npm ci
npm run android:apk
# → android/app/build/outputs/apk/release/app-release.apk
```

Metro не нужен: веб-ассеты в `assets/public` внутри APK.

## Требования

- Node.js 20+, JDK 21, Android SDK 35
- `android/local.properties` с `sdk.dir=...` (локально, не в git)
