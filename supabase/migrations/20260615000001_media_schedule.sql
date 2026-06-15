-- Расписание медиа-служения: роли и назначения (события — service_plans, см. 20260615150000)

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

-- Назначения создаются миграцией 20260615150000 после service_plans
