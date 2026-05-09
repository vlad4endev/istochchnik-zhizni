-- Раньше imported_at не заполнялся; помечаем строки с тегом импорта для экрана «Импортированные».
-- Учитываем и канонический тег «импортированная», и легаси «импортировано».
UPDATE songs s
SET imported_at = COALESCE(imported_at, s.updated_at)
WHERE NOT s.is_published
  AND (
    s.tags @> ARRAY['импортированная']::text[]
    OR s.tags @> ARRAY['импортировано']::text[]
  )
  AND s.imported_at IS NULL;
