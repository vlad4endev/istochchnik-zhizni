-- Ответы/реакции на истории в личных чатах (story_reply).
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
      AND e.enumlabel = 'story_reply'
  ) THEN
    ALTER TYPE public.message_payload_type ADD VALUE 'story_reply';
  END IF;
END $$;
