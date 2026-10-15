import type { PermissionsJson } from '../types/messenger';

/** Telegram caps group/channel titles at 128 characters. */
export const GROUP_CHAT_TITLE_MAX = 128;

export const MEMBER_SEARCH_DEFAULT_LIMIT = 50;
export const MEMBER_SEARCH_MAX_LIMIT = 200;
export const MEMBER_LIST_DEFAULT_LIMIT = 80;
export const MEMBER_LIST_MAX_LIMIT = 200;

const NAME_SEARCH_TOKEN_MAX = 6;

export class GroupChatTitleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroupChatTitleError';
  }
}

/** Collapse whitespace and enforce the Telegram title length. */
export function normalizeGroupChatTitle(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new GroupChatTitleError('Укажите название');
  }
  const title = raw.trim().replace(/\s+/g, ' ');
  if (!title) {
    throw new GroupChatTitleError('Укажите название');
  }
  if (title.length > GROUP_CHAT_TITLE_MAX) {
    throw new GroupChatTitleError(`Название не длиннее ${GROUP_CHAT_TITLE_MAX} символов`);
  }
  return title;
}

/**
 * Telegram-like group defaults: everyone can write and invite.
 * Channels keep the table default (the route only applies this to groups).
 */
export function defaultGroupPermissions(): PermissionsJson {
  return {
    can_send_messages: true,
    can_send_media: true,
    can_add_users: true,
    can_pin_messages: false,
    can_manage_chat: false,
  };
}

export function parsePageLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  if (v < 1) return fallback;
  return Math.min(v, max);
}

export function parsePageOffset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.trunc(n), 10_000);
}

/**
 * Tokens for people search. LIKE wildcards are stripped so a query cannot
 * accidentally match everyone. Mirrors the SQL `strpos` filter in searchMembers.
 */
export function nameSearchTokens(raw: string): string[] {
  const parts = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[%_\\]/g, ''))
    .filter((token) => token.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of parts) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= NAME_SEARCH_TOKEN_MAX) break;
  }
  return out;
}

export type MemberNameFields = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** Every token must appear in the full name, first name, or last name. */
export function memberMatchesNameQuery(member: MemberNameFields, query: string): boolean {
  const tokens = nameSearchTokens(query);
  if (tokens.length === 0) return true;
  const first = member.first_name ?? '';
  const last = member.last_name ?? '';
  const fields = [member.name ?? '', first, last, `${first} ${last}`.trim(), `${last} ${first}`.trim()].map(
    (value) => value.toLowerCase(),
  );
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}
