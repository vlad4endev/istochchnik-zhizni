ALTER TABLE public.global_settings
ADD COLUMN IF NOT EXISTS section_visibility_json text;
