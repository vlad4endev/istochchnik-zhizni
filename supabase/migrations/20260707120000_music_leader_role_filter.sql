-- Слот «Лидер поклонения» фильтрует участников по ministry_role «Лидер Прославления» из карточки.
UPDATE public.music_roles
SET ministry_role_filter = 'Лидер Прославления'
WHERE name = 'Лидер поклонения'
  AND (ministry_role_filter IS NULL OR ministry_role_filter = '');
