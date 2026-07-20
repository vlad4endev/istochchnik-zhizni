# iOS Push (FCM) — настройка

Android уже подключён через `android/app/google-services.json` (проект Firebase `mychurch-29bce`).
Для iOS нужен **отдельный** файл `GoogleService-Info.plist` — его пока нет в репозитории.

## Что уже сделано в коде

- В `Podfile` добавлен `FirebaseMessaging`
- `AppDelegate.swift` инициализирует Firebase (если есть plist) и отдаёт в Capacitor **FCM-токен**, а не сырой APNs
- В `Info.plist` включён `remote-notification` background mode
- Клиент `useFCM` отклоняет 64-символьные hex-токены на iOS (это APNs, не FCM)

## Шаги в Firebase / Apple

1. [Firebase Console](https://console.firebase.google.com/) → проект `mychurch-29bce` → Add app → **iOS**
2. Bundle ID: `com.istochnikzhizni.molitva` (как в Xcode / `capacitor.config`)
3. Скачать `GoogleService-Info.plist`
4. Положить файл в `web-react/ios/App/App/GoogleService-Info.plist` и добавить в target **App** в Xcode (Copy items if needed)
5. В Apple Developer: Push Notifications capability + APNs Auth Key (`.p8`)
6. Firebase → Project settings → Cloud Messaging → iOS → загрузить APNs Auth Key
7. Локально:

```bash
cd web-react
npx cap sync ios
cd ios/App && pod install
npx cap open ios
```

8. В Xcode: Signing & Capabilities → добавить **Push Notifications** (и Background Modes → Remote notifications, если ещё нет)

Секретный `GoogleService-Info.plist` в git не коммитьте (см. `ios/.gitignore`). Шаблон полей — `App/GoogleService-Info.plist.example`.
