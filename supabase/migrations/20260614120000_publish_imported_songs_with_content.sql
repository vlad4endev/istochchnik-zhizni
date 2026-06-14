-- Импортированные песни с текстом должны быть в общем песеннике (is_published = true).
-- Заготовки без текста (тег «нет_текста») остаются в песочнице до ручной публикации.

UPDATE songs s
SET is_published = TRUE,
    updated_at = NOW()
WHERE NOT s.is_published
  AND btrim(coalesce(s.content, '')) <> ''
  AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
  AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[]);
