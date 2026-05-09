-- Раньше imported_at не заполнялся; помечаем строки с тегом импорта для экрана «Импортированные».
UPDATE songs s
SET imported_at = COALESCE(imported_at, s.updated_at)
WHERE NOT s.is_published
  AND s.tags @> ARRAY['импортированная']::text[]
  AND s.imported_at IS NULL;
