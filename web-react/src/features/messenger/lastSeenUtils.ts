/**
 * Человекочитаемый статус «был(а) …» для личного чата (подзаголовок шапки).
 */
export function formatMessengerLastSeen(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return 'был(а) недавно';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'был(а) недавно';
  const diffMin = Math.floor((nowMs - t) / 60_000);
  if (diffMin < 1) return 'был(а) только что';
  if (diffMin < 60) return `был(а) ${diffMin} мин. назад`;
  const then = new Date(t);
  const now = new Date(nowMs);
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) {
    const hm = then.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `был(а) сегодня в ${hm}`;
  }
  const yest = new Date(nowMs);
  yest.setDate(yest.getDate() - 1);
  const yestDay =
    then.getFullYear() === yest.getFullYear() &&
    then.getMonth() === yest.getMonth() &&
    then.getDate() === yest.getDate();
  if (yestDay) return 'был(а) вчера';
  const d = then.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `был(а) ${d}`;
}
