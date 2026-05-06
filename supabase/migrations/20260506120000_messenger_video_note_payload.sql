-- Видеосообщения «кружок» (video note). Идемпотентно на любой версии PostgreSQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'message_payload_type'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'message_payload_type'
      AND e.enumlabel = 'video_note'
  ) THEN
    ALTER TYPE public.message_payload_type ADD VALUE 'video_note';
  END IF;
END $$;
