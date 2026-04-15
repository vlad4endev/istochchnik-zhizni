CREATE TABLE IF NOT EXISTS public.dashboard_coordinator_notes (
  kind VARCHAR(32) PRIMARY KEY CHECK (kind IN ('urgent_prayer', 'announcement')),
  body TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  updated_by_member_id INTEGER REFERENCES public.members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
