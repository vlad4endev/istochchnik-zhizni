/** Наибольший курсор прочтения среди указанных участников (id как строки-числа). */
export function maxCursor(cursors: Record<number, string> | undefined, exceptMemberId?: number | null): bigint {
  let max = 0n;
  if (!cursors) return max;
  for (const [member, value] of Object.entries(cursors)) {
    if (exceptMemberId != null && Number(member) === exceptMemberId) continue;
    if (/^\d+$/.test(value)) {
      const b = BigInt(value);
      if (b > max) max = b;
    }
  }
  return max;
}

/**
 * До какого сообщения дочитали другие. Берём максимум из событий прочтения и из списка чатов
 * (там для последнего сообщения есть `read_by_others`): курсоры только растут, поэтому если
 * дочитали последнее — прочитаны и все предыдущие.
 */
export function readUpTo(input: {
  cursors: Record<number, string> | undefined;
  myMemberId: number | null;
  lastMessage: { id: string; read_by_others?: boolean } | null | undefined;
}): bigint {
  let up = maxCursor(input.cursors, input.myMemberId);
  const last = input.lastMessage;
  if (last?.read_by_others && /^\d+$/.test(String(last.id))) {
    const b = BigInt(String(last.id));
    if (b > up) up = b;
  }
  return up;
}

/** Сообщение прочитано другими, если его id не больше курсора. Временные (не числовые) id — нет. */
export function isReadByOthers(messageId: string, upTo: bigint): boolean {
  return /^\d+$/.test(messageId) && BigInt(messageId) <= upTo && upTo > 0n;
}

/** Откуда переслано: имя автора или «сообщения»; null — сообщение не пересланное. */
export function forwardedFromName(raw: unknown): string | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const name = String((obj as { sender_name?: unknown }).sender_name ?? '').trim();
  return name || 'сообщения';
}

/** Подпись под заголовком окна «Прочитали». */
export function readersSubtitle(readCount: number, otherCount: number): string {
  if (readCount <= 0) return 'Пока никто не прочитал';
  if (otherCount > 0 && readCount >= otherCount) return `Прочитали все · ${readCount}`;
  if (otherCount > 0) return `Прочитали ${readCount} из ${otherCount}`;
  return `Прочитали: ${readCount}`;
}
