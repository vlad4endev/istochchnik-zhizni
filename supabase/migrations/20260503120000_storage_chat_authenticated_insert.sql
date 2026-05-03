-- Разрешить загрузку в бакет `chat` с клиента под Supabase Auth (JWT),
-- если позже включите прямую загрузку из браузера. API по-прежнему использует service role.

drop policy if exists "storage_authenticated_insert_chat" on storage.objects;
create policy "storage_authenticated_insert_chat"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat');
