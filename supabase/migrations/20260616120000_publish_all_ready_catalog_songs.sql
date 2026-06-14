-- Общий каталог: все готовые песни всех авторов → is_published (видны в песеннике всем).

UPDATE songs s
SET is_published = TRUE,
    updated_at = NOW()
WHERE NOT s.is_published
  AND btrim(coalesce(s.content, '')) <> ''
  AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
  AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[]);
