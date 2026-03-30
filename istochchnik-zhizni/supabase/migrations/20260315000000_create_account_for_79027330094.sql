-- Create account credentials for participant with phone +7 (902) 733-00-94.
-- Temporary password: Temp#7330094

update public.members
set
  phone_number = '+7 (902) 733-00-94',
  password_hash = coalesce(
    password_hash,
    '38f17ffc07a0cde7a7b8b27dd56fb427:6e735aaf7b8d3cb472fe744e5123be1ea73eca5a3f0c345da8e1986dbb6bef23eca93b529740ba0a45b11a057a4c083bbba41c7eedf3e7a190516313582e24e7'
  ),
  is_active = true,
  updated_at = now()
where regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') = '79027330094'
   or lower(trim(name)) = lower(trim('Чендев Влад'));
