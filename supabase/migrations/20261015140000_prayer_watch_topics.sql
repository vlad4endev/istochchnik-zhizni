-- Молитвенные темы для страж: каталог, дата старта цикла, порядок на цикл, оверрайд дня.

CREATE TABLE IF NOT EXISTS public.prayer_watch_topic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.prayer_watch_topic_settings (id, start_date)
VALUES (1, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.prayer_watch_topics (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  bible_verse TEXT,
  prayer_points TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prayer_watch_topics_active_sort
  ON public.prayer_watch_topics (is_active, sort_order, id);

CREATE TABLE IF NOT EXISTS public.prayer_watch_topic_cycle_order (
  cycle_index BIGINT NOT NULL PRIMARY KEY,
  topic_ids INTEGER[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prayer_watch_topic_day_overrides (
  target_date DATE NOT NULL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES public.prayer_watch_topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prayer_watch_topic_day_overrides_topic
  ON public.prayer_watch_topic_day_overrides (topic_id);
