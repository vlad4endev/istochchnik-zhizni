/**
 * Упоминания в группах. В поле ввода человек видит «@Имя», на сервер уходит `@[id]`
 * (так хранится в БД, сервер сам уведомляет упомянутых). В ленте `@[id]` снова показывается как «@Имя».
 */

export type MentionPick = { id: number; label: string };

const WORD = /[\p{L}\p{N}_]/u;
const MAX_QUERY_LEN = 30;

/** Подпись без символов, ломающих разметку. */
export function cleanLabel(label: string, id: number): string {
  const s = String(label).replace(/[\[\]⁠]/g, '').replace(/\s+/g, ' ').trim();
  return s || `участник ${id}`;
}

/**
 * Есть ли у курсора незавершённое «@запрос». Возвращает позицию «@» и текст запроса.
 * «@» должна стоять в начале строки или после пробела (почта вида a@b не считается).
 */
export function findMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const upTo = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const at = upTo.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(upTo[at - 1]!)) return null;
  const query = upTo.slice(at + 1);
  if (query.includes('\n') || query.length > MAX_QUERY_LEN) return null;
  return { start: at, query };
}

/** Кого предлагать по запросу: подпись содержит запрос (без учёта регистра); не больше `limit`. */
export function filterMentionCandidates(all: MentionPick[], query: string, limit = 5): MentionPick[] {
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((p) => p.label.toLowerCase().includes(q)) : all;
  return list.slice(0, limit);
}

/** Подставляет «@Имя » вместо набранного «@запроса». Возвращает новый текст и позицию курсора. */
export function applyMention(
  text: string,
  start: number,
  cursor: number,
  pick: MentionPick,
): { text: string; cursor: number } {
  const insert = `@${cleanLabel(pick.label, pick.id)} `;
  const next = text.slice(0, start) + insert + text.slice(cursor);
  return { text: next, cursor: start + insert.length };
}

/**
 * Перед отправкой превращает «@Имя» из списка выбранных в `@[id]`. Если пользователь стёр или
 * изменил имя, упоминание не засчитывается. Одинаковые имена сопоставляются по порядку выбора.
 */
export function canonicalizeMentions(text: string, picks: MentionPick[]): string {
  let out = text;
  const from = new Map<string, number>();
  for (const pick of picks) {
    const label = cleanLabel(pick.label, pick.id);
    const needle = `@${label}`;
    let idx = from.get(label) ?? 0;
    for (;;) {
      idx = out.indexOf(needle, idx);
      if (idx < 0) break;
      const before = idx > 0 ? out[idx - 1]! : ' ';
      const after = out[idx + needle.length] ?? ' ';
      if (!WORD.test(before) && !WORD.test(after)) {
        const token = `@[${pick.id}]`;
        out = out.slice(0, idx) + token + out.slice(idx + needle.length);
        from.set(label, idx + token.length);
        break;
      }
      idx += 1;
    }
  }
  return out;
}

/** При правке сообщения показывает «@Имя» вместо `@[id]` и возвращает выбранные упоминания. */
export function denormalizeMentions(
  text: string,
  namesById: Record<number, string>,
): { text: string; picks: MentionPick[] } {
  const picks: MentionPick[] = [];
  const out = text.replace(/@\[(\d+)\]/g, (full, idStr: string) => {
    const id = Number(idStr);
    const name = namesById[id];
    if (!Number.isFinite(id) || id <= 0 || !name?.trim()) return full;
    const label = cleanLabel(name, id);
    picks.push({ id, label });
    return `@${label}`;
  });
  return { text: out, picks };
}

export type MentionSegment = { text: string; mentionId?: number };

/** Делит текст сообщения на обычные куски и упоминания для подсветки. */
export function splitMentions(content: string, namesById: Record<number, string>): MentionSegment[] {
  const out: MentionSegment[] = [];
  const re = /@\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ text: content.slice(last, m.index) });
    const id = Number(m[1]);
    const name = namesById[id];
    out.push({ text: `@${name?.trim() ? cleanLabel(name, id) : 'участник'}`, mentionId: id });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ text: content.slice(last) });
  return out;
}

export function hasMentions(content: string): boolean {
  return /@\[\d+\]/.test(content);
}

/** Для превью в списке чатов: `@[id]` → «@участник». */
export function stripMentions(content: string): string {
  return content.replace(/@\[\d+\]/g, '@участник');
}
