-- Managed song tags catalog for Studio (shared across the project).
-- Song associations remain in songs.tags TEXT[] for existing filters.

CREATE TABLE IF NOT EXISTS public.studio_song_tags (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  created_by_member_id INTEGER REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_song_tags_name_lower_uidx
  ON public.studio_song_tags (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_studio_song_tags_name
  ON public.studio_song_tags (name);

-- Seed from existing song tags (exclude system / sandbox markers).
INSERT INTO public.studio_song_tags (name)
SELECT DISTINCT TRIM(t.tag)
FROM public.songs s
CROSS JOIN LATERAL unnest(COALESCE(s.tags, '{}'::text[])) AS t(tag)
WHERE TRIM(t.tag) <> ''
  AND TRIM(t.tag) NOT LIKE '\_\_%' ESCAPE '\'
  AND LOWER(TRIM(t.tag)) NOT IN ('импортированная', 'импортировано', 'нет_текста')
ON CONFLICT DO NOTHING;
