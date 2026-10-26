# Аудит: звонки в фоне и при блокировке экрана

Дата: 2026-10-27 (Europe/Moscow).

## Симптом

Личные и групповые звонки перестают работать, если убрать приложение в фон или заблокировать телефон. После разблокировки медиа «мёртвое» или звонок уже завершён.

## Корневые причины

### 1. Beacon `/end` на `pagehide` (личные)

В `CallWindow` на `pagehide` уходил `sendBeacon(/api/calls/:id/end)` для 1:1.  
На Capacitor iOS/Android `pagehide` срабатывает при **блокировке экрана и переключении приложений**, а не только при закрытии вкладки → сервер завершал звонок.

Группы были частично защищены (beacon отключён для active group), поэтому личные ломались заметнее.

### 2. Нет удержания процесса под lock (Android)

Был только **входящий** CallStyle + `USE_FULL_SCREEN_INTENT` / `MANAGE_OWN_CALLS`.  
После принятия звонка WebRTC жил в WebView **без** foreground service → при lock Android замораживал/убивал медиа-стек (targetSdk 35).

### 3. CallKit только на входящий ring (iOS)

PushKit → CallKit для входящего. После Accept / для исходящих и group join не было ongoing CallKit + стабильной `AVAudioSession` на время LiveKit → под lock WKWebView терял аудио, несмотря на `UIBackgroundModes: audio, voip`.

### 4. PWA

В браузере / Home Screen PWA **нельзя** надёжно держать WebRTC под lock. Ожидание: только Capacitor-сборка.

## Что сделано

| Слой | Изменение |
|------|-----------|
| Policy | `callBackgroundPolicy.ts` — beacon только для web 1:1 outgoing ring |
| JS | `useNativeOngoingCall` → `NativeCall.startOngoing` при `status=active` |
| Android | `OngoingCallService` (FGS microphone\|camera\|mediaPlayback) + permissions |
| iOS | `CallKitManager.startOngoing` + hold `AVAudioSession` |
| Docs | `docs/calls-livekit.md` § «Активный звонок при блокировке» |

## Что остаётся / рекомендации

1. **Выкатить нативные сборки** (Capacitor sync + store). Правки Java/Swift не попадают в один только web-деплой.
2. На Android OEM (Xiaomi/Huawei/Samsung) — промпт «игнорировать оптимизацию батареи» в настройках звонков.
3. Опционально позже: полный `ConnectionService` / Telecom self-managed для ещё более «телефонного» поведения (сейчас достаточно FGS + CallStyle ongoing).
4. PWA: в UI явно писать, что стабильные звонки в фоне — только в приложении.
