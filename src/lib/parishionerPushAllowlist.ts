/**
 * Какие push-типы получает роль `parishioner`.
 * Согласовано с `isParishionerAllowedPushData` в pushService и текстом в профиле.
 */
export const PARISHIONER_ALLOWED_PUSH_KINDS = [
  'broadcast',
  'broadcast_start',
  'member_joined',
  'prayer_reminder',
  'birthday_today',
  'birthday_week',
  'new_sermon',
  'new_event',
  'system_update',
  'feed_like',
  'feed_comment',
  'feed_repost',
  'feed_new_post',
] as const;

export type ParishionerAllowedPushKind = (typeof PARISHIONER_ALLOWED_PUSH_KINDS)[number];

const KIND_SET = new Set<string>(PARISHIONER_ALLOWED_PUSH_KINDS);

/** Типы назначений служений / координаторских дайджестов — прихожанам не шлём. */
export function isParishionerAllowedPushKindOrType(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (KIND_SET.has(normalized)) return true;
  if (normalized.startsWith('broadcast')) return true;
  return false;
}
