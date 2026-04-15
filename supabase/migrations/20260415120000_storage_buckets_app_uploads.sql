-- App uploads: Supabase Storage buckets + публичное чтение (загрузка только с API через service role).
-- Имена бакетов совпадают с дефолтами в src/lib/supabaseStorage.ts

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('chat', 'chat', true, 52428800),
  ('user-media', 'user-media', true, 52428800)
on conflict (id) do nothing;

-- Анонимные и залогиненные клиенты Supabase Auth могут только читать объекты (прямые URL / getPublicUrl).
-- INSERT/UPDATE/DELETE выполняются с service role (RLS обходится) или позже — отдельными политиками.

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
