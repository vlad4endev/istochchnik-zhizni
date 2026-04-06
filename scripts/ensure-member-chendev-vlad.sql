-- Карточка: Влад Чендев, +79027330094 (как в форме: Имя «Влад», Фамилия «Чендев»).
-- Регистрация сопоставляет телефон и ФИО с members (см. src/services/authService.ts).
--
-- Применение на сервере с Docker:
--   docker exec -i istochnik-db psql -U postgres -d istochik_db < scripts/ensure-member-chendev-vlad.sql
-- или локально:
--   psql "$DATABASE_URL" -f scripts/ensure-member-chendev-vlad.sql

BEGIN;

UPDATE members
SET
  first_name = 'Влад',
  last_name = 'Чендев',
  name = 'Чендев Влад',
  phone_number = '+79027330094',
  app_role = 'admin',
  is_collection_coordinator = TRUE,
  is_active = TRUE,
  updated_at = NOW()
WHERE regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g') = '79027330094'
   OR lower(trim(COALESCE(name, ''))) = lower(trim('Чендев Влад'))
   OR lower(trim(COALESCE(name, ''))) = lower(trim('Влад Чендев'))
   OR (
        lower(trim(COALESCE(first_name, ''))) = lower(trim('Влад'))
    AND lower(trim(COALESCE(last_name, ''))) = lower(trim('Чендев'))
   );

INSERT INTO members (
  first_name,
  last_name,
  name,
  phone_number,
  app_role,
  is_collection_coordinator,
  is_active
)
SELECT
  'Влад',
  'Чендев',
  'Чендев Влад',
  '+79027330094',
  'admin',
  TRUE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM members
  WHERE regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g') = '79027330094'
);

COMMIT;

-- Если вместо регистрации видите «аккаунт уже существует», а пароль забыли — вручную:
-- UPDATE members SET password_hash = NULL, updated_at = NOW()
-- WHERE regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g') = '79027330094';
