-- Registration approval flow:
-- if participant match exists -> immediate access,
-- otherwise request stays pending for admin review.

alter table public.members
  add column if not exists first_name varchar(120),
  add column if not exists last_name varchar(120),
  add column if not exists phone_number varchar(32),
  add column if not exists password_hash text;

create index if not exists members_phone_digits_idx
  on public.members ((regexp_replace(coalesce(phone_number, ''), '\D', '', 'g')));

create table if not exists public.access_requests (
  id bigserial primary key,
  first_name varchar(120) not null,
  last_name varchar(120) not null,
  full_name varchar(255) not null,
  phone_number varchar(32) not null,
  phone_digits varchar(20) not null,
  password_hash text not null,
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  member_id integer references public.members(id) on delete set null,
  reviewed_by_member_id integer references public.members(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_status_idx
  on public.access_requests (status);

create index if not exists access_requests_phone_digits_idx
  on public.access_requests (phone_digits);
