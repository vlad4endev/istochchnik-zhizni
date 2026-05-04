-- =============================================================================
-- Создание бакетов Storage для мессенджера и медиа профиля (ручной запуск).
-- Выполните в Supabase: Dashboard → SQL → New query → Run.
-- Либо: supabase db push (миграция supabase/migrations/20260415120000_storage_buckets_app_uploads.sql).
--
-- Бакет для вложений чата имеет id = `chat` (не `messenger`). В API дефолт тот же (см. messengerBucket()).
-- Если в .env задано SUPABASE_STORAGE_BUCKET_MESSENGER=messenger при отсутствии такого бакета — либо
-- удалите переменную (будет `chat`), либо создайте бакет с нужным id вручную в Storage.
-- =============================================================================

-- Бакеты: публичное чтение (загрузка с вашего API через service role).
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat', 'chat', true, 52428800),
  ('user-media', 'user-media', true, 52428800)
on conflict (id) do nothing;

-- Чтение объектов для прямых URL / getPublicUrl (аноним и authenticated).
drop policy if exists "storage_public_read_chat" on storage.objects;
create policy "storage_public_read_chat"
  on storage.objects for select
  to public
  using (bucket_id = 'chat');

drop policy if exists "storage_public_read_user_media" on storage.objects;
create policy "storage_public_read_user_media"
  on storage.objects for select
  to public
  using (bucket_id = 'user-media');

-- Опционально: прямая загрузка из браузера под Supabase Auth (JWT).
-- API по-прежнему может грузить через service role без этой политики.
drop policy if exists "storage_authenticated_insert_chat" on storage.objects;
create policy "storage_authenticated_insert_chat"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat');
