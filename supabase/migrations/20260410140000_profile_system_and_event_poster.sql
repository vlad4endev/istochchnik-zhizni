-- Event poster image (dashboard).
alter table public.church_events add column if not exists poster_url text;

-- Profile feed (parity with Node initDb).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'profile_media_type') then
    create type public.profile_media_type as enum ('image', 'video');
  end if;
end $$;

create table if not exists public.user_profiles (
  member_id integer primary key references public.members (id) on delete cascade,
  username varchar(64) not null,
  display_name varchar(120),
  bio text,
  avatar_url text,
  is_private boolean not null default false,
  allow_comments varchar(16) not null default 'public'
    check (allow_comments in ('public', 'followers', 'private')),
  show_activity_status boolean not null default true,
  theme_mode varchar(16) not null default 'system'
    check (theme_mode in ('system', 'light', 'dark')),
  theme_accent_color varchar(32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_username_uidx
  on public.user_profiles (lower(username));

create table if not exists public.profile_posts (
  id bigserial primary key,
  member_id integer not null references public.members (id) on delete cascade,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_posts_member_created
  on public.profile_posts (member_id, created_at desc);

create table if not exists public.profile_post_media (
  id bigserial primary key,
  post_id bigint not null references public.profile_posts (id) on delete cascade,
  url text not null,
  type public.profile_media_type not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create index if not exists idx_profile_post_media_post
  on public.profile_post_media (post_id);

create table if not exists public.profile_post_comments (
  id bigserial primary key,
  post_id bigint not null references public.profile_posts (id) on delete cascade,
  member_id integer references public.members (id) on delete set null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_post_comments_post_created
  on public.profile_post_comments (post_id, created_at asc);

create index if not exists idx_profile_post_comments_member
  on public.profile_post_comments (member_id);

create table if not exists public.profile_post_likes (
  post_id bigint not null references public.profile_posts (id) on delete cascade,
  member_id integer not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

create index if not exists idx_profile_post_likes_post
  on public.profile_post_likes (post_id);
