# Android APK = та же PWA (Capacitor) + офлайн БД

Приложение для Android — это **тот же `web-react`**, что и сайт/PWA, в Capacitor WebView.

- Package ID: `com.istochnikzhizni.molitva`
- UI — идентичен браузерной версии
- API: `https://app.church-tambov.ru`
- **Офлайн БД:** IndexedDB (Dexie) на устройстве, синхронизация с PostgreSQL через `/api/sync`

## Как приложение получает данные

```
UI (web-react)
  → IndexedDB (Dexie): songs, members, feed cache, sync_queue
  ↔ HTTPS /api/sync/bootstrap|pull|push  (+ /api/songs, /api/feed …)
  → Express → PostgreSQL
```

1. После входа запускается `OfflineSyncBridge`: bootstrap каталога песен, затем incremental pull.
2. Песенник читает сервер онлайн и параллельно пишет в IndexedDB; **офлайн** — только локальная БД.
3. Лента кэшируется в IndexedDB при успешной загрузке и отдаётся из кэша без сети.
4. Локальные create песен (через sync queue) уходят на сервер при появлении сети.

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
