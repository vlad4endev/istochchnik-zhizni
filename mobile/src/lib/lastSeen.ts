/** Статус «был(а) …» для шапки личного чата, как в вебе. */
export function formatLastSeen(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return 'был(а) недавно';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'был(а) недавно';
  const diffMin = Math.floor((nowMs - t) / 60_000);
  if (diffMin < 1) return 'был(а) только что';
  if (diffMin < 60) return `был(а) ${diffMin} мин. назад`;
  const then = new Date(t);
  const now = new Date(nowMs);
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    const hm = then.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `был(а) сегодня в ${hm}`;
  }
  const yest = new Date(nowMs);
  yest.setDate(yest.getDate() - 1);
  if (then.toDateString() === yest.toDateString()) return 'был(а) вчера';
  return `был(а) ${then.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

/** «1 участник / 2 участника / 5 участников». */
export function membersWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'участник' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'участника' : 'участников';
  return `${n} ${w}`;
}
