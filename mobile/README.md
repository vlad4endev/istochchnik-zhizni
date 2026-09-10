# Mobile (Expo / React Native) — Источник жизни

Нативное Android-приложение на **Expo SDK 56**. Живёт в отдельном пакете `mobile/` и **не входит** в lint/build/Docker основного веб+API проекта.

## Почему не трогаем основной проект

| Пакет | Назначение |
|-------|------------|
| `src/` + `web-react/` | Веб и API (production) |
| `mobile/` | React Native (Expo) — этот клиент |
| `android-app/` | Отдельный offline-first MVP песенника (не смешивать) |
| Capacitor в `web-react/` | WebView-обёртка SPA, не RN |

Корневые `npm run lint` / `build` / Docker **не** подключают `mobile/`. Зависимости ставятся только внутри `mobile/`.

## Уже реализовано

- Auth (логин, pending review, сессия)
- Главная, чаты + realtime, молитва, песенник, проповеди
- Студия (сетлисты / perform), планировщик служения
- Расписания: медиа / музыка / воскресенье
- Лента, трансляции, конспекты проповедей («Мои проповеди»)
- Настройки API URL, тема

## Сборка Android APK

1. Установить зависимости:
   ```bash
   cd mobile && npm install
   ```
2. Один раз привязать EAS: `cd mobile && npx eas-cli login && npx eas-cli init`
3. Preview APK:
   ```bash
   npm run build:apk
   ```
   или из корня монорепо: `npm run expo:build:apk`
4. Production AAB (Play Store): `npm run build:aab`

Локальный prebuild (нужен Android SDK):

```bash
npm run prebuild:android
# затем открыть android/ в Android Studio или:
npx expo run:android
```

## Dev против локального API

- Эмулятор Android: по умолчанию `http://10.0.2.2:40978`
- Реальное устройство: в «Ещё» укажите LAN IP, например `http://192.168.1.5:40978`
- API должен быть запущен отдельно (`npx ts-node-dev --transpile-only --respawn src/main.ts`)

## Команды из корня

```bash
npm run expo:start      # Metro
npm run expo:android    # Expo + Android
npm run expo:typecheck  # tsc в mobile/
npm run expo:build:apk  # EAS preview APK
```

## Дальше (паритет с вебом)

- Stories / профили / создание постов
- Редактор конспектов и студии (AI, импорт)
- Admin / analytics
- FCM push
- WebRTC-звонки
