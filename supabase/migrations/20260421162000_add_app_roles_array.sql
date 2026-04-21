-- Support multiple application roles per member while keeping primary app_role.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS app_roles TEXT[];

UPDATE public.members
SET app_roles = ARRAY[app_role]
WHERE app_roles IS NULL OR cardinality(app_roles) = 0;

ALTER TABLE public.members
  ALTER COLUMN app_roles SET DEFAULT ARRAY['member'];

ALTER TABLE public.members
  ALTER COLUMN app_roles SET NOT NULL;
