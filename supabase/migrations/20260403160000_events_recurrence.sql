alter table if exists public.church_events
  add column if not exists recurrence_type varchar(16);

update public.church_events
set recurrence_type = 'once'
where recurrence_type is null or recurrence_type not in ('once', 'weekly');

alter table if exists public.church_events
  alter column recurrence_type set default 'once';

alter table if exists public.church_events
  alter column recurrence_type set not null;

alter table if exists public.church_events
  drop constraint if exists church_events_recurrence_type_check;

alter table if exists public.church_events
  add constraint church_events_recurrence_type_check
  check (recurrence_type in ('once', 'weekly'));

alter table if exists public.church_events
  add column if not exists weekly_day smallint;

alter table if exists public.church_events
  drop constraint if exists church_events_weekly_day_check;

alter table if exists public.church_events
  add constraint church_events_weekly_day_check
  check (weekly_day is null or (weekly_day between 0 and 6));
