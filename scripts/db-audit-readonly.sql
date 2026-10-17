-- Аудит облачной БД (Supabase / managed Postgres). ТОЛЬКО ЧТЕНИЕ.
-- Запуск: bash scripts/db-audit.sh   (подробности — docs/backend-audit.md)
-- Ничего не меняет: сессия переводится в read-only, а сами запросы — только SELECT.

\set ON_ERROR_STOP off
\pset pager off
\pset null '—'
SET default_transaction_read_only = on;
SET statement_timeout = '20s';

\echo
\echo '=== 1. Подключение ==='
SELECT current_user                                        AS "роль",
       (SELECT rolsuper    FROM pg_roles WHERE rolname = current_user) AS "superuser",
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS "bypass_rls",
       current_setting('server_version')                   AS "версия",
       current_setting('default_transaction_read_only')    AS "read_only_сессия";

\echo
\echo '=== 2. TLS у этого соединения (ssl=t — шифруется) ==='
SELECT ssl, version AS "tls", cipher
FROM pg_stat_ssl WHERE pid = pg_backend_pid();

\echo
\echo '=== 3. RLS: сводка по public ==='
SELECT count(*)                                        AS "таблиц",
       count(*) FILTER (WHERE c.relrowsecurity)        AS "RLS включён",
       count(*) FILTER (WHERE NOT c.relrowsecurity)    AS "RLS ВЫКЛЮЧЕН"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

\echo
\echo '=== 4. Таблицы public БЕЗ RLS (для Supabase Data API это дыра, если у anon/authenticated есть права) ==='
SELECT c.relname AS "таблица"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

\echo
\echo '=== 5. Права ролей anon / authenticated на таблицы public (если роли есть) ==='
SELECT grantee, count(DISTINCT table_name) AS "таблиц с правами",
       string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS "права"
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;

\echo
\echo '=== 6. Таблицы с RLS, но без единой политики (доступ закрыт всем, кроме обходящих RLS) ==='
SELECT c.relname AS "таблица"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
ORDER BY 1;

\echo
\echo '=== 7. Таблицы без первичного ключа ==='
SELECT c.relname AS "таблица"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')
ORDER BY 1;

\echo
\echo '=== 8. Журнал миграций (если таблицы журнала есть) ==='
SELECT format('SELECT %L AS "источник", count(*) AS "применено", max(version) AS "последняя" FROM supabase_migrations.schema_migrations', 'supabase_migrations')
WHERE to_regclass('supabase_migrations.schema_migrations') IS NOT NULL \gexec
SELECT format('SELECT %L AS "источник", count(*) AS "применено", max(migration_name) AS "последняя" FROM public._prisma_migrations', '_prisma_migrations')
WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec
SELECT 'журнал миграций не найден (схема строится кодом при старте API)' AS "итог"
WHERE to_regclass('supabase_migrations.schema_migrations') IS NULL AND to_regclass('public._prisma_migrations') IS NULL;

\echo
\echo '=== 9. Крупнейшие таблицы ==='
SELECT c.relname AS "таблица",
       pg_size_pretty(pg_total_relation_size(c.oid)) AS "размер",
       c.reltuples::bigint AS "строк (оценка)"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10;

\echo
\echo '=== 10. Размер базы и нагрузка на соединения ==='
SELECT pg_size_pretty(pg_database_size(current_database())) AS "размер БД",
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS "соединений",
       current_setting('max_connections')::int AS "max_connections",
       (SELECT count(*) FROM pg_stat_activity
         WHERE datname = current_database() AND state = 'idle in transaction') AS "idle in transaction";

\echo
\echo '=== 11. Расширения ==='
SELECT extname AS "расширение", extversion AS "версия" FROM pg_extension ORDER BY 1;

\echo
\echo '=== 12. Данные: дубли участников по имени и фамилии ==='
SELECT name, count(*) AS "копий"
FROM members GROUP BY name HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 10;

\echo
\echo '=== 13. Данные: сессии (просроченные хранятся без пользы) ==='
SELECT count(*) AS "всего", count(*) FILTER (WHERE expires_at < now()) AS "просрочено"
FROM auth_sessions;

\echo
\echo '=== 14. Данные: сообщения и шифрование (доля зашифрованных) ==='
SELECT count(*) AS "сообщений",
       count(*) FILTER (WHERE content LIKE '{%"iv"%' AND content LIKE '%"encryptedData"%') AS "зашифровано"
FROM messages;

\echo
\echo '=== Готово. Ничего не изменялось. ==='
