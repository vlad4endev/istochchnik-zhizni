-- =============================================================================
-- Supabase Storage: бакеты и политики для мессенджера и медиа профиля.
--
-- Запуск: Supabase Dashboard → SQL Editor → вставить весь файл → Run.
-- Идемпотентно: повторный запуск безопасен.
--
-- Создаётся:
--   • Бакет `chat`     — вложения чата (дефолт API: SUPABASE_STORAGE_BUCKET_MESSENGER не задан или = chat).
--   • Бакет `user-media` — аватары, медиа профиля, афиши (SUPABASE_STORAGE_BUCKET_USER_MEDIA).
--
-- Политики на storage.objects:
--   • Публичное чтение (SELECT) для `chat` и `user-media` — публичные URL и getPublicUrl.
--   • INSERT в `chat` для роли authenticated — опциональная прямая загрузка из браузера с JWT;
--     основной путь приложения — загрузка через API (service role), RLS для INSERT не обязателен.
--
-- Не создаётся бакет `messenger`: в коде по умолчанию используется `chat`. Если в .env указан
-- несуществующий id — уберите переменную или укажите реальный id бакета.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Бакеты (50 MiB на объект; публичное чтение)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat', 'chat', true, 52428800),
  ('user-media', 'user-media', true, 52428800)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- -----------------------------------------------------------------------------
-- 2. RLS на storage.objects (в Supabase обычно уже включён; команда безопасна)
-- -----------------------------------------------------------------------------
alter table if exists storage.objects enable row level security;

-- -----------------------------------------------------------------------------
-- 3. SELECT: публичное чтение объектов из обоих бакетов
-- -----------------------------------------------------------------------------
drop policy if exists "storage_public_read_chat" on storage.objects;
create policy "storage_public_read_chat"
  on storage.objects
  for select
  to public
  using (bucket_id = 'chat');

drop policy if exists "storage_public_read_user_media" on storage.objects;
create policy "storage_public_read_user_media"
  on storage.objects
  for select
  to public
  using (bucket_id = 'user-media');

-- -----------------------------------------------------------------------------
-- 4. INSERT: клиент с Supabase Auth может грузить в `chat` (если включите прямую загрузку)
-- -----------------------------------------------------------------------------
drop policy if exists "storage_authenticated_insert_chat" on storage.objects;
create policy "storage_authenticated_insert_chat"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'chat');

-- -----------------------------------------------------------------------------
-- Проверка (раскомментируйте при необходимости):
-- select id, name, public, file_size_limit from storage.buckets where id in ('chat', 'user-media');
-- select polname, polcmd, polroles::regrole[] from pg_policy p join pg_class c on c.oid = p.polrelid
--   where c.relname = 'objects' and c.relnamespace = (select oid from pg_namespace where nspname = 'storage');
-- =============================================================================
