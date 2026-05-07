-- E2EE readiness: store member public keys and message encrypted payload envelope.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS public_key text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS encrypted_payload text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_e2ee boolean NOT NULL DEFAULT false;
