## Админка: «Резервная копия»

В веб-админке (`/admin?tab=backup`) доступны:

- создание полного архива и скачивание;
- список копий, удаление;
- хранение **не дольше 30 дней** (настраивается 1–30);
- автобекап по расписанию (ежедневно / по дням недели);
- отправка архива администратору через Telegram-бота.

API (только admin): `/api/backup/settings`, `/list`, `/create`, `/:id/download`, `/:id/send-telegram`, `DELETE /:id`.

Для Telegram: бот должен быть включён в разделе Telegram; у админов заполнен `telegram_chat_id` и/или задан default chat. Файлы больше ~49 МБ уходят текстом с просьбой скачать в админке (лимит Bot API).

## Бекап и восстановление (CLI)

В проекте **не было** готового полного бекапа (только замечания про Docker volumes). Добавлены скрипты:

| Команда | Назначение |
|---------|------------|
| `npm run backup` | Полный снимок: PostgreSQL + uploads + secrets |
| `npm run backup:list` | Список каталогов в `backups/` |
| `npm run backup:verify -- backups/latest` | SHA256 + gzip + заголовок pg_dump |
| `bash scripts/restore.sh <dir>` | Dry-run проверка |
| `CONFIRM_RESTORE=YES bash scripts/restore.sh <dir>` | Реальное восстановление |

Каталог `backups/` в `.gitignore` — в git не попадает.

## Что сохраняется

1. **PostgreSQL** — `pg_dump -Fc` (custom format) + gzip. Источник:
   - запущенный compose-сервис `db`, или
   - `DATABASE_URL` (локальный Postgres / Supabase) через контейнер `postgres:16-alpine`
2. **uploads/** — legacy-файлы на диске (`UPLOADS_DIR` или `./uploads`)
3. **secrets/** — по умолчанию да; с `BACKUP_ENCRYPT_PASSPHRASE` шифруется AES-256
4. **env.keys.txt** — только имена переменных из `.env` (без значений)
5. Опционально **полный .env** — только при `BACKUP_INCLUDE_ENV=1` + passphrase → `env.full.enc`

Каждый снимок: `MANIFEST.txt`, `checksums.sha256`, атомарная публикация (`.partial-*` → rename), flock против параллельных запусков, retention (`BACKUP_KEEP_DAYS` / `BACKUP_KEEP_COUNT`).

## Что бекап скрипта НЕ покрывает

- **Supabase Storage** (новые аватары/вложения в облаке) — используйте бэкапы/PITR в панели Supabase или отдельный экспорт buckets.
- **Код репозитория** — это git (`git clone` / теги релизов).
- **Redis** — кэш/realtime, не источник истины.

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
