-- Роль приложения «прихожанин» (гостевой режим): ограниченный доступ после одобрения заявки.

UPDATE public.members
SET app_role = 'member'
WHERE app_role IS NULL
   OR app_role NOT IN ('member', 'parishioner', 'minister', 'pastor', 'musician', 'editor', 'admin');

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_app_role_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_app_role_check
  CHECK (app_role IN ('member', 'parishioner', 'minister', 'pastor', 'musician', 'editor', 'admin'));
