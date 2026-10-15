/** Служебные каналы приложения. Их нельзя сносить пачкой «удалить пустые». */
export const SYSTEM_CHAT_KINDS = [
  'assistant',
  'access_requests',
  'media_team',
  'service_plan_planning',
] as const;

export type SystemChatKind = (typeof SYSTEM_CHAT_KINDS)[number];

export function isSystemChatKind(kind: string): boolean {
  return (SYSTEM_CHAT_KINDS as readonly string[]).includes(kind);
}

/** Безопасный SQL-список литералов для `NOT IN`. Значения только из константы выше. */
export function systemChatKindSqlList(): string {
  return SYSTEM_CHAT_KINDS.map((kind) => `'${kind}'`).join(', ');
}

export const ADMIN_CHAT_FILTERS = [
  'rooms',
  'group',
  'channel',
  'private',
  'empty',
  'active',
  'all',
] as const;

export type AdminChatListFilter = (typeof ADMIN_CHAT_FILTERS)[number];

export function parseAdminChatListFilter(raw: unknown): AdminChatListFilter {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if ((ADMIN_CHAT_FILTERS as readonly string[]).includes(value)) {
    return value as AdminChatListFilter;
  }
  return 'rooms';
}
