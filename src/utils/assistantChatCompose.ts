/**
 * Кто может писать в личный канал «ИИ помощник».
 *
 * Канал создаётся с role=owner и can_send_messages=true, но у части участников
 * в БД остаётся role=member или явный запрет can_send_messages=false
 * (override участника переживает superpowers владельца). Для своего чата
 * набор текста всегда разрешён: mute здесь только глушит уведомления.
 */

const ASSISTANT_CHANNEL_KIND = 'assistant';
/** Совпадает с `MESSENGER_ASSISTANT_CHANNEL_TITLE` в messengerService. */
const ASSISTANT_CHANNEL_TITLE = 'ИИ помощник';

function channelMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === 'string') {
    const trimmed = metadata.trim();
    if (!trimmed) return null;
    try {
      return channelMetadataRecord(JSON.parse(trimmed) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

export function isAssistantChannelMetadata(metadata: unknown): boolean {
  const rec = channelMetadataRecord(metadata);
  return rec != null && String(rec.kind ?? '') === ASSISTANT_CHANNEL_KIND;
}

/**
 * true, если это чат «ИИ помощник» и участник — его владелец
 * (owner_member_id или роль owner/admin).
 */
export function assistantMemberCanCompose(input: {
  metadata: unknown;
  memberId: number;
  role: string;
}): boolean {
  const rec = channelMetadataRecord(input.metadata);
  if (!rec || String(rec.kind ?? '') !== ASSISTANT_CHANNEL_KIND) return false;
  const role = String(input.role ?? '');
  if (role === 'owner' || role === 'admin') return true;
  const owner = String(rec.owner_member_id ?? '').trim();
  // Владелец не записан — участник уже в своём личном канале (починка допишет id).
  if (!owner) return true;
  return owner === String(input.memberId);
}

/** Показывать ли чат в списке. Прихожанину — никогда, даже если metadata пустая, а название осталось. */
export function shouldExposeAssistantConversation(input: {
  metadata: unknown;
  title?: string | null;
  assistantAllowed: boolean;
  memberId: number;
  role?: string | null;
}): boolean {
  const assistant = isAssistantChannelMetadata(input.metadata);
  const titled = String(input.title ?? '').trim() === ASSISTANT_CHANNEL_TITLE;
  if (!assistant && !titled) return true;
  if (!input.assistantAllowed) return false;
  if (!assistant) return true;
  return assistantMemberCanCompose({
    metadata: input.metadata,
    memberId: input.memberId,
    role: input.role ?? 'member',
  });
}
