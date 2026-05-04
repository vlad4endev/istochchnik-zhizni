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
-- 5. Итог в UI: после INSERT/CREATE в редакторе часто «Успех», но сетка пустая — это норма.
--     Ниже SELECT вернёт 2 строки (chat, user-media), если всё применилось к этому проекту.
-- -----------------------------------------------------------------------------
select id, name, public, file_size_limit
from storage.buckets
where id in ('chat', 'user-media')
order by id;

-- Дополнительно (политики на storage.objects; имена могут отличаться в кастомных проектах):
-- select pol.polname, pol.polcmd, pol.polpermissive
-- from pg_policy pol
-- join pg_class cls on cls.oid = pol.polrelid
-- join pg_namespace nsp on nsp.oid = cls.relnamespace
-- where nsp.nspname = 'storage' and cls.relname = 'objects'
-- order by pol.polname;
-- =============================================================================
