-- =============================================================================
-- Создание бакетов Storage для мессенджера и медиа профиля (ручной запуск).
-- Выполните в Supabase: Dashboard → SQL → New query → Run.
-- Либо: supabase db push (миграции в supabase/migrations/ дублируют этот смысл).
--
-- После выполнения в API по умолчанию используется бакет id = `chat`
-- (переменная SUPABASE_STORAGE_BUCKET_MESSENGER, см. .env.example).
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
