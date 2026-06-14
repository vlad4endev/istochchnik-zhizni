-- Текст часто сохраняли только в studio_versions; переносим в каталог (песенник) неопубликованные импорты.

UPDATE songs s
SET content = sub.content,
    default_key = COALESCE(sub.custom_key, s.default_key),
    is_published = TRUE,
    tags = COALESCE(
      (
        SELECT array_agg(t)
        FROM unnest(s.tags) AS t
        WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
      ),
      '{}'::text[]
    ),
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (sv.song_id)
    sv.song_id,
    sv.custom_content AS content,
    sv.custom_key
  FROM studio_versions sv
  WHERE btrim(coalesce(sv.custom_content, '')) <> ''
  ORDER BY sv.song_id, length(sv.custom_content) DESC, sv.updated_at DESC
) sub
WHERE s.id = sub.song_id
  AND NOT s.is_published
  AND btrim(coalesce(s.content, '')) = '';
