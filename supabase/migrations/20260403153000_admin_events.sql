create table if not exists public.church_events (
  id bigserial primary key,
  title varchar(255) not null,
  description text,
  event_date date not null,
  event_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_events_date_time
  on public.church_events (event_date asc, event_time asc);
