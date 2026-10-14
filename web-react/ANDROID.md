# Android APK = та же PWA (Capacitor)

Приложение для Android — это **тот же `web-react`**, что и сайт/PWA, обёрнутый в Capacitor WebView.

- Package ID: `com.istochnikzhizni.molitva`
- UI, маршруты, стили — идентичны браузерной версии
- API: `https://app.church-tambov.ru` (задаётся при сборке)
- Нативные дополнения: FCM, splash, входящие звонки (CallStyle)

> Отдельный клиент `android-app/` (React Native + WatermelonDB) — другой package ID и другой UI. Для «как на сайте» используйте этот Capacitor APK.

## Сборка standalone APK

```bash
cd web-react
npm ci
npm run android:apk
# → android/app/build/outputs/apk/release/app-release.apk
```

Скрипт: Vite production build с `VITE_RELATIVE_BASE` → `cap sync android` → `assembleRelease`.

Metro не нужен: веб-ассеты лежат в `assets/public` внутри APK.

## Требования

- Node.js 20+, JDK 21, Android SDK 35
- `android/local.properties` с `sdk.dir=...` (локально, не в git)
