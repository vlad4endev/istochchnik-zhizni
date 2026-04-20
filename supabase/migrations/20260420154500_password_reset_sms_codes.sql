create table if not exists public.password_reset_sms_codes (
  id bigserial primary key,
  member_id integer not null references public.members(id) on delete cascade,
  phone_digits varchar(20) not null,
  code_hash text not null,
  attempts_count integer not null default 0,
  send_not_before timestamptz,
  expires_at timestamptz not null,
  verified_at timestamptz,
  verified_token_hash text,
  verified_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists password_reset_sms_codes_member_id_idx
  on public.password_reset_sms_codes(member_id, id desc);

create index if not exists password_reset_sms_codes_expires_at_idx
  on public.password_reset_sms_codes(expires_at);
