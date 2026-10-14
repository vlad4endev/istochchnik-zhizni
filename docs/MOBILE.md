# Мобильные клиенты

## Канон: Capacitor (`web-react/`)

Единственный поддерживаемый native shell:

- `web-react/android` + `web-react/ios`
- `appId`: `com.istochnikzhizni.molitva`
- Пуши: FCM + Web Push (PWA); VoIP/CallKit на iOS
- Звонки: LiveKit + native CallStyle / CallKit

Сборка:

```bash
cd web-react
npm ci
npm run mobile:build   # vite build + cap sync
npm run android:apk    # debug APK (нужен Android SDK)
```

## Deprecated (не развивать как продукт)

| Каталог | Стек | Статус |
|---------|------|--------|
| `mobile/` | Expo / React Native | Заморожен; UI-референс |
| `android-app/` | RN + WatermelonDB | Исторический MVP sync songbook; контракт `/api/sync` переиспользуется в Capacitor |

Новые фичи (оффлайн, пуши, звонки) — только в `web-react` + API `src/`.
