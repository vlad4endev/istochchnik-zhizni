-- Synced with supabase/migrations/20260421120000_setlist_item_musician_notes.sql
ALTER TABLE setlist_items
ADD COLUMN IF NOT EXISTS musician_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
