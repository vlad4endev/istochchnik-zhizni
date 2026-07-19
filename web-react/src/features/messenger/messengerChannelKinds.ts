/** Совпадает с `metadata.kind` канала в БД (см. `ensureAccessRequestsMessengerChannel`). */
export const MESSENGER_ACCESS_REQUESTS_CHANNEL_KIND = 'access_requests';

/** Совпадает с `metadata.kind` личного ИИ-чата (см. `ensureAssistantConversation`). */
export const MESSENGER_ASSISTANT_CHANNEL_KIND = 'assistant';

export function isAccessRequestsMessengerChannel(metadata: unknown): boolean {
  return (
    metadata != null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    String((metadata as Record<string, unknown>).kind ?? '') === MESSENGER_ACCESS_REQUESTS_CHANNEL_KIND
  );
}

export function isAssistantMessengerChannel(metadata: unknown): boolean {
  return (
    metadata != null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    String((metadata as Record<string, unknown>).kind ?? '') === MESSENGER_ASSISTANT_CHANNEL_KIND
  );
}

export function isAssistantBotMessage(payload: unknown, senderId: number | null | undefined): boolean {
  if (senderId != null) return false;
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  return p.assistant === true || String(p.kind ?? '') === MESSENGER_ASSISTANT_CHANNEL_KIND;
}
