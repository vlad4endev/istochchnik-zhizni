/** Совпадает с `metadata.kind` канала в БД (см. `ensureAccessRequestsMessengerChannel`). */
export const MESSENGER_ACCESS_REQUESTS_CHANNEL_KIND = 'access_requests';

export function isAccessRequestsMessengerChannel(metadata: unknown): boolean {
  return (
    metadata != null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    String((metadata as Record<string, unknown>).kind ?? '') === MESSENGER_ACCESS_REQUESTS_CHANNEL_KIND
  );
}
