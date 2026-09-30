# Схема БД: источники и план

Сейчас схему описывают **три независимых места**, и они расходятся:

| Источник | Кто применяет | Замечание |
|---|---|---|
| `src/config/initDb.ts` (+ `MEMBER_SEED_SQL`) | API на старте, если `SKIP_DB_INIT_ON_START=false` | основная часть таблиц (мессенджер, аналитика, ...) |
| `ensure*Schema` в сервисах (push, feed, media/music-schedule, sermon-notes, telegram-send-logs, app-releases, ...) | API на старте всегда | DDL размазан по ~30 файлам `src/` |
| `supabase/migrations/*.sql` | `supabase db push` (`scripts/supabase-db-push.sh`, `RUN_SUPABASE_PUSH=1`) | 114 файлов; на пустой БД не применяются целиком |
| `prisma/migrations` | не используется приложением | Prisma-схема без моделей |

## Решение

Источник правды — **`supabase/migrations`**. Схему меняем только новыми файлами миграций; DDL в `initDb` и `ensure*Schema` больше не добавляем, а существующий убираем поэтапно.

## Проверка расхождений

`scripts/schema-drift.sh` поднимает две пустые БД (только на локальном Postgres, продовую не трогает) и сравнивает:
**app** = `initDb` + `ensure*Schema` (`src/cli/bootSchema.ts`), **mig** = `supabase/migrations` по порядку.

```bash
ADMIN_URL=postgres://postgres:postgres@localhost:5432 bash scripts/schema-drift.sh
```

## Замер на 2026-09-29

- Миграции на пустой БД падают (16 файлов с ошибками): много файлов ссылаются на таблицы, которых в миграциях нет
  (`messages`, `conversations`, `profile_posts`, `push_subscriptions`, `members.is_active`, ...).
  Схема по одним миграциям не собирается.
- Таблицы только в app (22): весь мессенджер (`conversations`, `messages`, `message_*`, `read_receipts`,
  `chat_pins`), аналитика (`analytics_sessions`, `page_views`, `feature_events`), `app_logs`, `broadcasts`,
  `push_subscriptions`, `telegram_chats`, шаблоны служений (`ministry_*_templates`) и др.
- Таблицы только в migrations (8): `service_blocks`, `service_templates`, `service_template_blocks`,
  `block_types`, `sunday_schedule_slots`, `mentor_assignments`, `password_reset_sms_codes`,
  `preacher_sermon_data_reminders` — их в app создают лениво отдельные сервисы, а не на старте.
- Колонки: только в app — 196, только в migrations — 94.

(Замер с заглушками ролей и схем `auth`/`storage`; на настоящем Supabase часть ошибок про `auth`/`storage` исчезнет.)

## Дальше

1. Базовая миграция, доводящая migrations до полного набора таблиц и колонок (идемпотентная, `IF NOT EXISTS`, на проде — no-op).
   Нужна проверка на копии продовой схемы: порядок миграций на проде менять нельзя.
2. Вынести DDL из `ensure*Schema` в миграции и убрать вызовы на старте.
3. Оставить `initDb` только для локальной разработки или заменить на применение миграций; удалить `prisma/migrations`.
4. Добавить `schema-drift.sh` в CI (нужен сервис Postgres).
