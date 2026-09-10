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
- Лента: лайки, комментарии, создание поста, репост / удаление, stories (просмотр / создание / ответ / удаление своих)
- Профиль (просмотр / редактирование / аватар)
- Трансляции, конспекты проповедей (создание и редактирование)
- Push-регистрация + тап по уведомлению → чат/лента
- Настройки API URL, тема, статус push

## FCM (production Android)

1. В Firebase Console создайте Android-приложение с package `com.istochnikzhizni.molitva`
2. Скачайте `google-services.json` в `mobile/` (файл в `.gitignore`)
3. Шаблон: `mobile/google-services.json.example`
4. `app.config.js` подключает файл только если он есть — без него preview-сборка всё равно возможна (Expo push token)

## Сборка Android APK

1. Установить зависимости: `cd mobile && npm install`
2. Один раз: `npx eas-cli login && npx eas-cli init`
3. Preview APK: `npm run build:apk` (или из корня `npm run expo:build:apk`)
4. Production AAB: `npm run build:aab`

Локально (нужен Android SDK): `npm run prebuild:android` затем `npx expo run:android`.

## Dev против локального API

- Эмулятор Android: по умолчанию `http://10.0.2.2:40978`
- Реальное устройство: в «Ещё» укажите LAN IP, например `http://192.168.1.5:40978`
- API: `npx ts-node-dev --transpile-only --respawn src/main.ts`

## Команды из корня

```bash
npm run expo:start
npm run expo:android
npm run expo:typecheck
npm run expo:build:apk
```

## Дальше (паритет с вебом)

- Полные редакторы студии и AI/импорт
- Admin / analytics
- WebRTC-звонки
- Полировка мессенджера (опросы, голосовые, права группы)
