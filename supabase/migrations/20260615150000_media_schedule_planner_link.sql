-- Привязка медиа-назначений к планировщику служений (service_plans), без отдельной media_events

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
