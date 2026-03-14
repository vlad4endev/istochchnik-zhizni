-- Grant admin role and set phone for Чендев Влад.

update public.members
set
  name = 'Чендев Влад',
  first_name = 'Влад',
  last_name = 'Чендев',
  phone_number = '+79027330094',
  app_role = 'admin',
  is_active = true,
  updated_at = now()
where lower(trim(name)) = lower(trim('Чендев Влад'));
