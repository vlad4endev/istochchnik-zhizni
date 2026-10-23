Для продакшена в Docker: образ API должен включать `scripts/` (см. Dockerfile) и пакеты
`bash` + `postgresql16-client`. Каталог снимков — том `/app/backups` (`BACKUP_DIR`).
После обновления кода: **пересоберите образ API** (`docker compose build --no-cache api && docker compose up -d api`).

## Админка: «Резервная копия»

В веб-админке (`/admin?tab=backup`) доступны:

- создание **полного детального снимка** и скачивание;
- просмотр **состава** копии (инвентарь БД, переписки, настройки, сервер, Storage);
- список копий (локально / Google Drive / оба), удаление;
- **Google Drive** — основное off-site хранилище (service account + папка);
- **восстановление** из выбранной копии (сначала безопасная проверка, затем запись с подтверждением `ВОССТАНОВИТЬ`);
- хранение **не дольше 30 дней** (настраивается 1–30), отдельно локально и на Drive;
- автобекап по расписанию (ежедневно / по дням недели);
- отправка архива администратору через Telegram-бота.

API (только admin): `/api/backup/settings`, `/list`, `/create`, `/drive/status`, `/drive/list`, `/drive/oauth/start`, `/drive/oauth/callback`, `/drive/oauth/disconnect`, `/:id/detail`, `/:id/download`, `/:id/send-telegram`, `/:id/send-drive`, `POST /:id/restore`, `DELETE /:id`.

### Google Drive (рекомендуемая схема)

Все настройки Drive — **только в админке**.

**Личный Gmail (обычный диск):** Google больше не даёт service account писать в расшаренную папку
(`Insufficient permissions for the specified parent`). Нужен вход вашим Google-аккаунтом:

1. Google Cloud → APIs & Services → включите **Google Drive API**.
2. Credentials → Create OAuth client ID → **Web application**.
3. В Authorized redirect URIs добавьте `https://<ваш-домен>/api/backup/drive/oauth/callback`
   (точный URL показан в админке).
4. Скачайте JSON клиента, вставьте в «Резервная копия», сохраните, нажмите **Войти через Google**.
5. Укажите ID папки того же аккаунта.

При первом входе Google покажет «приложение не проверено» — это нормально для своего клиента:
«Дополнительные сведения» → перейти к приложению.

**Google Workspace:** можно по-прежнему service account + **общий диск** (Shared Drive), SA —
участник с правом «Управляющий содержимым». Шаринг обычной папки My Drive на SA для записи
не работает.

После создания снимка архив уходит на Drive. Локально сервер может не копить гигабайты.

### Восстановление из админки

1. Откройте копию → **Восстановить**.
2. Выберите компоненты (БД / uploads / secrets).
3. Нажмите **Проверить** (dry-run, ничего не меняет).
4. Введите `ВОССТАНОВИТЬ` и подтвердите запись. Перед записью создаётся safety-бекап текущего состояния.

Для Telegram: бот должен быть включён в разделе Telegram; у админов заполнен `telegram_chat_id` и/или задан default chat. Файлы больше ~49 МБ уходят текстом с просьбой скачать в админке (лимит Bot API).

## Бекап и восстановление (CLI)

| Команда | Назначение |
|---------|------------|
| `npm run backup` | Полный снимок: PostgreSQL + uploads + secrets + server.snapshot |
| `npm run backup:enrich -- backups/latest` | Детализация: inventory, settings, messenger, Storage |
| `npm run backup:list` | Список каталогов в `backups/` |
| `npm run backup:verify -- backups/latest` | SHA256 + gzip + заголовок pg_dump |
| `bash scripts/restore.sh <dir>` | Dry-run проверка |
| `CONFIRM_RESTORE=YES bash scripts/restore.sh <dir>` | Реальное восстановление |

Каталог `backups/` в `.gitignore` — в git не попадает.

Создание из **админки** всегда выполняет enrich автоматически (полный детальный снимок).

## Что сохраняется (полный детальный снимок)

1. **PostgreSQL** — `pg_dump -Fc` (custom format) + gzip. Включает:
   - участников, события, молитвы, студию, push;
   - **переписки** (`conversations`, `messages`, реакции, опросы, пины);
   - **настройки** (`global_settings` и связанные таблицы).
2. **uploads/** — legacy-файлы на диске (`UPLOADS_DIR` или `./uploads`)
3. **secrets/** — по умолчанию да; с `BACKUP_ENCRYPT_PASSPHRASE` шифруется AES-256
4. **env.keys.txt** — только имена переменных из `.env` (без значений)
5. Опционально **полный .env** — только при `BACKUP_INCLUDE_ENV=1` + passphrase → `env.full.enc`
6. **server.snapshot.json** — hostname, ОС, Node, git SHA, число env-ключей, хеши compose/Dockerfile
7. **inventory.json** — счётчики ключевых таблиц (участники, сообщения, …)
8. **settings.snapshot.json** — снимок `global_settings` с редaction секретов (токены → `[REDACTED]`)
9. **messenger.summary.json** — сводка чатов (полные тексты — в дампе БД)
10. **storage/** — экспорт бакетов Supabase (`chat`, `user-media`) при настроенном Storage

Каждый снимок: `MANIFEST.txt`, `components.json`, `checksums.sha256`, атомарная публикация (`.partial-*` → rename), flock против параллельных запусков, retention (`BACKUP_KEEP_DAYS` / `BACKUP_KEEP_COUNT`).

## Что бекап НЕ покрывает

- **Redis** — кэш/realtime, не источник истины (пересоздаётся).
- **Код репозитория** — это git (`git clone` / теги релизов).
- **LiveKit / внешние SaaS** — credentials через secrets/env; состояние звонков эфемерно.

Если Supabase Storage не настроен, в `storage/manifest.json` будет `configured: false`; метаданные переписок всё равно в дампе БД.

## Безопасное восстановление

1. Всегда сначала dry-run (без `CONFIRM_RESTORE`):
   ```bash
   bash scripts/restore.sh backups/latest
   ```
2. Реальная запись только с явным подтверждением:
   ```bash
   CONFIRM_RESTORE=YES bash scripts/restore.sh backups/istochnik-backup-YYYYMMDD-HHMMSS
   ```
3. Перед записью скрипт сам делает **safety-бекап** текущего состояния (отключить: `SKIP_SAFETY_BACKUP=1`).
4. Текущие `uploads/` и `secrets/` перед перезаписью переименовываются в `*.pre-restore-*`.
5. Полный `.env` из бекапа пишется в `.env.restored`, оригинал не затирается.
6. Файлы из `storage/` восстанавливайте в бакеты вручную или через отдельный импорт (restore.sh сейчас пишет БД / uploads / secrets).

Опасный полный сброс схемы перед restore (обычно не нужен — есть `--clean`):

```bash
CONFIRM_RESTORE=YES RESTORE_DB_DANGEROUS_DROP=1 bash scripts/restore.sh …
```

## Прод: ежедневный cron + бекап перед обновлением

В `.env` на сервере:

```bash
BACKUP_BEFORE_UPDATE=1
BACKUP_KEEP_DAYS=14
BACKUP_KEEP_COUNT=14
# BACKUP_ENCRYPT_PASSPHRASE=длинная-случайная-фраза
# BACKUP_SKIP_STORAGE=1   # если не нужно тянуть облачные файлы
```

Cron (пример):

```cron
30 3 * * * cd /var/www/istochnik && /usr/bin/npm run backup >>/var/log/istochnik-backup.log 2>&1
```

Копии с VPS лучше периодически копировать **off-site** (`rsync`/`scp` каталога `backups/` на другой диск или S3). Один диск = одна точка отказа.

## Шифрование

```bash
export BACKUP_ENCRYPT_PASSPHRASE='…'
BACKUP_INCLUDE_ENV=1 npm run backup
```

Появятся `db.dump.gz.enc` / `secrets.tar.gz.enc` / `env.full.enc`. Для restore задайте тот же passphrase.

## Проверка после бекапа

```bash
npm run backup:verify -- backups/latest
# или
bash scripts/backup.sh verify backups/latest
```
