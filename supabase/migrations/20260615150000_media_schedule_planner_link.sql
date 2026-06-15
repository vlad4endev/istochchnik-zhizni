-- Привязка медиа-назначений к планировщику служений (service_plans), без отдельной media_events

CREATE TABLE IF NOT EXISTS public.media_roles (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  ministry_direction_filter TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.media_roles (name, color, sort_order)
VALUES
  ('Режиссёр',   '#7d3640', 1),
  ('Слова',      '#0891b2', 2),
  ('Оператор 1', '#059669', 3),
  ('Оператор 2', '#16a34a', 4),
  ('Звук',       '#d97706', 5)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.media_roles
  ADD COLUMN IF NOT EXISTS ministry_direction_filter TEXT;

DROP TABLE IF EXISTS public.media_assignments;
DROP TABLE IF EXISTS public.media_events;

CREATE TABLE public.media_assignments (
  id            BIGSERIAL PRIMARY KEY,
  event_ref_id  BIGINT NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  member_id     BIGINT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role_id       BIGINT NOT NULL REFERENCES public.media_roles(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned', 'confirmed', 'declined', 'pending')),
  notes         TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_by    BIGINT REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_ref_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_media_assignments_event_ref_id ON public.media_assignments (event_ref_id);
CREATE INDEX IF NOT EXISTS idx_media_assignments_member_id ON public.media_assignments (member_id);
CREATE INDEX IF NOT EXISTS idx_media_assignments_role_id ON public.media_assignments (role_id);
