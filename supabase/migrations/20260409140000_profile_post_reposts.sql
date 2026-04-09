-- Mirror of prisma/migrations/20260409140000_profile_post_reposts/migration.sql

alter table public.profile_posts
  add column if not exists shared_post_id bigint references public.profile_posts (id) on delete cascade;

create index if not exists idx_profile_posts_shared_post_id
  on public.profile_posts (shared_post_id)
  where shared_post_id is not null;

create unique index if not exists uq_profile_posts_one_repost_per_user_root
  on public.profile_posts (member_id, shared_post_id)
  where shared_post_id is not null;
