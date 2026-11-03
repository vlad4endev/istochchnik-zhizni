/**
 * Идентичность участника (`members`):
 * - `id` — внутренний числовой PK; на него ссылаются FK в данных приложения
 * - `user_id` — стабильный публичный UUID для клиентов и поиска пользователя
 */

/** Формат UUID как в PostgreSQL `gen_random_uuid()` / `members.user_id`. */
const PUBLIC_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Публичный UUID из `members.user_id`. */
export function isPublicUserId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return PUBLIC_USER_ID_RE.test(trimmed);
}

/** Внутренний числовой `members.id` из path/query. */
export function parseMemberNumericId(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || isPublicUserId(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export type MemberRefKind = 'numeric_id' | 'public_user_id';

export type ParsedMemberRef =
  | { kind: 'numeric_id'; id: number }
  | { kind: 'public_user_id'; userId: string };

/** Разбирает `:id` маршрута: числовой PK или публичный UUID. */
export function parseMemberRef(value: unknown): ParsedMemberRef | null {
  if (typeof value === 'string' && isPublicUserId(value)) {
    return { kind: 'public_user_id', userId: value.trim().toLowerCase() };
  }
  const id = parseMemberNumericId(value);
  if (id != null) {
    return { kind: 'numeric_id', id };
  }
  return null;
}

/** Нормализует публичный UUID из ответа API / строки. */
export function normalizePublicUserId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!isPublicUserId(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}
