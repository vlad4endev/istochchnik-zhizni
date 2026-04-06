-- Rich messenger card for registration access requests (admin channel «Заявки»).
do $$
begin
  if exists (select 1 from pg_type where typname = 'message_payload_type') then
    begin
      alter type public.message_payload_type add value if not exists 'access_request';
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
