/**
 * Упоминания для обычных пользователей: в поле ввода удобный вид `@[Имя](id)`,
 * в БД и в ленте — компактный `@[id]` (имя подставляется при отображении).
 */

const FRIENDLY_MENTION_RE = /@\[([^\]]+)\]\((\d+)\)/g;

/** Токен для вставки из списка @ (видно имя, не «цифры»). */
export function buildMentionToken(label: string, id: number): string {
  const safe =
    String(label)
      .replace(/\]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || `участник ${id}`;
  return `@[${safe}](${id})`;
}

/** Перед отправкой на сервер: только `@[число]` (как хранится в БД). */
export function normalizeMentionsToCanonical(content: string): string {
  return content.replace(FRIENDLY_MENTION_RE, (_m, _label, id) => {
    const digits = String(id).replace(/\D/g, '');
    return digits ? `@[${digits}]` : '';
  });
}

/** При открытии редактирования: показать имя вместо сырого @[id]. */
export function denormalizeMentionsForEditor(
  text: string,
  namesById: Record<number, string>,
): string {
  return text.replace(/@\[(\d+)\]/g, (full, idStr) => {
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) return full;
    const name = namesById[id];
    if (!name || !String(name).trim()) return full;
    return buildMentionToken(name, id);
  });
}

/** Все id упоминаний (после нормализации достаточно `@[число]`). */
export function extractMentionMemberIdsFromText(content: string): number[] {
  const normalized = normalizeMentionsToCanonical(content);
  if (!normalized) return [];
  const re = /@\[(\d+)\]/g;
  const ids: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)];
}
