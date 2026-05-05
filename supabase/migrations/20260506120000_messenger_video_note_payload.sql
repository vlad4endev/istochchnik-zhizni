-- Видеосообщения «кружок» (video note), как в Telegram
do $$
begin
  if exists (select 1 from pg_type where typname = 'message_payload_type') then
    begin
      alter type public.message_payload_type add value if not exists 'video_note';
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
