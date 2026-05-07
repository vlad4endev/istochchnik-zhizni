/**
 * Упоминания в группах: в поле ввода видно только «@Имя» (как в Telegram).
 * Идентификатор участника кодируется невидимыми U+2060 вокруг числа.
 * В БД и при отдаче в ленту — компактный `@[memberId]`; имя подставляется при отображении.
 */

/** WORD JOINER — невидимый маркер границ id в поле ввода */
export const MENTION_ID_WRAP = '\u2060';

const LEGACY_MARKDOWN_MENTION_RE = /@\[([^\]]+)\]\((\d+)\)/g;

/** `@Имя\u2060id\u2060` → `@[id]` */
const VISUAL_MENTION_RE = new RegExp(
  `@([^${MENTION_ID_WRAP}\n]+?)${MENTION_ID_WRAP}(\\d+)${MENTION_ID_WRAP}`,
  'g',
);

function sanitizeMentionLabel(label: string, id: number): string {
  const safe =
    String(label)
      .replace(/\u2060/g, '')
      .replace(/\]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || `участник ${id}`;
  return safe;
}

/** Токен для вставки из списка @ — в textarea видно только @Имя. */
export function buildMentionToken(label: string, id: number): string {
  const safe = sanitizeMentionLabel(label, id);
  return `@${safe}${MENTION_ID_WRAP}${id}${MENTION_ID_WRAP}`;
}

/** Перед отправкой на сервер: только `@[число]` (как хранится в БД). */
export function normalizeMentionsToCanonical(content: string): string {
  let s = content.replace(VISUAL_MENTION_RE, (_m, _name, id) => {
    const digits = String(id).replace(/\D/g, '');
    return digits ? `@[${digits}]` : '';
  });
  s = s.replace(LEGACY_MARKDOWN_MENTION_RE, (_m, _label, id) => {
    const digits = String(id).replace(/\D/g, '');
    return digits ? `@[${digits}]` : '';
  });
  return s;
}

/** При открытии редактирования: показать «@Имя», а не сырой @[id]. */
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

/** Фрагмент строки сразу после «@»: уже набран полный визуальный токен — автодополнение не нужно. */
export function isCompletedVisualMentionFragment(fragAfterAt: string): boolean {
  return new RegExp(`^[^${MENTION_ID_WRAP}\n]+${MENTION_ID_WRAP}\\d+${MENTION_ID_WRAP}`).test(
    fragAfterAt,
  );
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
