# Чек-лист звонков на реальных устройствах

Проверять на **убитом** приложении, **заблокированном** экране, режиме энергосбережения, смене Wi‑Fi↔LTE.

## Android

1. Входящий звонок при убитом процессе → CallStyle / full-screen intent.
2. Accept / Decline / Missed / cancel с другой стороны снимает UI.
3. `USE_FULL_SCREEN_INTENT` разрешён (Android 14+ настройки).
4. Исключение из оптимизации батареи запрошено (см. `requestIgnoreBatteryOptimizations`).
5. Bluetooth / наушники / динамик переключаются во время звонка.
6. Возврат в звонок после сворачивания.
7. TURN/TLS из мобильной сети (CGNAT) — при сбое медиа вынести coturn на VPS.

## iOS

1. На **каждый** VoIP PushKit сразу `reportNewIncomingCall` (иначе iOS режет доставку).
2. CallKit Accept/Decline синхронен с `/api/calls` + WS.
3. Background audio / микрофон после сворачивания.
4. `GoogleService-Info.plist` + APNs VoIP keys на сервере.

## Общее

- LiveKit room join после accept.
- `call_ended` / cancel снимает системный UI на обоих устройствах.
- Deep link `/call/join/:token` открывает join flow.
