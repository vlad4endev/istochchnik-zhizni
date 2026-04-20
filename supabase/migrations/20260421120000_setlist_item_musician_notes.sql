-- Заметки для музыкантов по позициям в тексте (не показываются в публичной ссылке)
ALTER TABLE setlist_items
ADD COLUMN IF NOT EXISTS musician_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
