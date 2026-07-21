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

function asPayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

export function isAssistantBotMessage(payload: unknown, senderId: number | null | undefined): boolean {
  if (senderId != null) return false;
  const p = asPayloadRecord(payload);
  if (!p) return false;
  return p.assistant === true || String(p.kind ?? '') === MESSENGER_ASSISTANT_CHANNEL_KIND;
}
