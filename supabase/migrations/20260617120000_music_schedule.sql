-- Расписание музыкального служения: роли и назначения (события — service_plans)

CREATE TABLE IF NOT EXISTS public.music_roles (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  ministry_direction_filter TEXT,
  ministry_role_filter TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.music_roles (name, color, sort_order)
VALUES
  ('Лидер поклонения', '#7d3640', 1),
  ('Клавиши',          '#6366f1', 2),
  ('Гитара',           '#059669', 3),
  ('Барабаны',         '#d97706', 4),
  ('Вокал',            '#0891b2', 5),
  ('Звук',             '#9333ea', 6)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.music_assignments (
  id            BIGSERIAL PRIMARY KEY,
  event_ref_id  BIGINT NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  member_id     BIGINT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role_id       BIGINT NOT NULL REFERENCES public.music_roles(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned', 'confirmed', 'declined', 'pending')),
  notes         TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_by    BIGINT REFERENCES public.members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_ref_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_music_assignments_event_ref_id ON public.music_assignments (event_ref_id);
CREATE INDEX IF NOT EXISTS idx_music_assignments_member_id ON public.music_assignments (member_id);
CREATE INDEX IF NOT EXISTS idx_music_assignments_role_id ON public.music_assignments (role_id);
