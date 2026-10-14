# Секреты и ротация ключей

Файлы с секретами **не коммитятся**. Каталог `secrets/` в git содержит только `.gitkeep`; JSON/PEM монтируются на сервере.

## Ожидаемые файлы (имена, без значений)

| Файл / переменная | Назначение |
|-------------------|------------|
| `secrets/firebase-sa.json` | Firebase Admin (FCM) |
| `web-react/ios/.../GoogleService-Info.plist` | Firebase iOS (локально) |
| `web-react/android/.../google-services.json` | Firebase Android client config (часто в репо; не private key) |
| `DB_SSL_CA` / `DB_SSL_CA_PATH` | CA для TLS к Postgres |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `APNS_*` / VoIP key | iOS PushKit |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit |
| `DATABASE_URL` / `POSTGRES_PASSWORD` | Postgres |
| Auth session secrets / cookie keys | см. `.env.example` |
| Android upload keystore | вне репозитория (`*.jks` / `release.keystore`) |

## Если секреты когда-либо попали в git

Перевыпустить (rotate):

1. Firebase service account + ограничить Android/iOS API keys в Google Cloud
2. APNs / VoIP keys
3. LiveKit API key/secret
4. VAPID pair (`npm run push:vapid`)
5. Postgres password / connection strings
6. Любые JWT/HMAC/message encryption keys из `.env`

После ротации обновить секреты на VPS/Portainer и перезапустить API.
