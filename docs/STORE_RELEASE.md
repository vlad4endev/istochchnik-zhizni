# Выпуск в магазины (Фаза 7)

## Подпись Android

- Keystore **вне репозитория** (`*.jks` / `release.keystore` в `.gitignore`).
- `web-react/android/app/build.gradle` → `signingConfigs.release` через env / `keystore.properties` (не коммитить).

## Сборка

```bash
cd web-react
npm ci
VITE_APP_VERSION=1.0.0 npm run mobile:build
cd android && ./gradlew bundleRelease   # AAB для Play
# или assembleRelease для APK / RuStore
```

## iOS / TestFlight

- Xcode: archive → TestFlight.
- Associated Domains: `applinks:app.church-tambov.ru`.
- Push: `GoogleService-Info.plist` локально + APNs VoIP на API.

## Fastlane (скелет)

См. `web-react/fastlane/` — lanes `android beta` / `ios beta` заполняются секретами CI.

## Политики магазинов

- Privacy policy URL (обязателен): описать FCM, микрофон/камеру звонков, оффлайн-кэш.
- Удаление аккаунта: экран в профиле / запрос в поддержку + API soft-delete (уже есть `deleted_at` на members для sync).
- Описание разрешений: POST_NOTIFICATIONS, CAMERA, RECORD_AUDIO, FULL_SCREEN_INTENT.

## Принудительное обновление

Таблица `app_releases` + API `/api/app-releases` — публиковать `min_version` / force flag; клиент сравнивает с `VITE_APP_VERSION`.
