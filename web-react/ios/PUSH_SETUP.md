# iOS Push (FCM) — настройка

Android уже подключён через `android/app/google-services.json` (проект Firebase `mychurch-29bce`).
Для iOS нужен **отдельный** файл `GoogleService-Info.plist` — его пока нет в репозитории.

## Что уже сделано в коде

- В `Podfile` добавлен `FirebaseMessaging`
- `AppDelegate.swift` инициализирует Firebase (если есть plist) и отдаёт в Capacitor **FCM-токен**, а не сырой APNs
- В `Info.plist` включён `remote-notification` background mode
- Добавлен `App/App.entitlements` (`aps-environment`) и подключён в `project.pbxproj` — без него iOS не выдаёт APNs-токен и пуши не приходят вообще
- `MessagingDelegate` пробрасывает в Capacitor обновлённый FCM-токен при ротации
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

## CallKit + PushKit (входящий как системный звонок)

В коде уже есть:

- `CallKitManager.swift` / `NativeCallPlugin.swift` — PushKit → CallKit
- Background mode `voip` в `Info.plist`
- Клиент шлёт VoIP-токен на `POST /api/notifications/save-voip-token`
- Сервер шлёт VoIP push через APNs (`src/services/apnsVoipPush.ts`), если заданы ключи

### Что настроить в Apple Developer

1. Identifiers → App ID `com.istochnikzhizni.molitva` → включить **Push Notifications**.
2. Создать **VoIP Services Certificate** (или использовать тот же APNs Auth Key `.p8` с topic `{bundleId}.voip`).
3. В Xcode: Background Modes → **Voice over IP** + **Remote notifications**.
4. На сервере API задать:

```bash
APNS_KEY_ID=<Key ID из Apple>
APNS_TEAM_ID=<Team ID>
APNS_P8_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_BUNDLE_ID=com.istochnikzhizni.molitva
APNS_PRODUCTION=true
```

Без этих переменных CallKit-клиент работает, но VoIP wake с сервера не уйдёт (останется обычный FCM alert / foreground WS).

**Важно для App Review:** VoIP push можно использовать только для реальных входящих звонков; на каждый VoIP push нужно сразу вызывать `reportNewIncomingCall` (так и сделано в `CallKitManager`).
