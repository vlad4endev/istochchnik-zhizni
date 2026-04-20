-- Add "pastor" as a valid application role.
UPDATE public.members
SET app_role = 'member'
WHERE app_role IS NULL
   OR app_role NOT IN ('member', 'pastor', 'musician', 'editor', 'admin');

ALTER TABLE public.members
  ALTER COLUMN app_role SET DEFAULT 'member';

ALTER TABLE public.members
  ALTER COLUMN app_role SET NOT NULL;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_app_role_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_app_role_check
  CHECK (app_role IN ('member', 'pastor', 'musician', 'editor', 'admin'));
