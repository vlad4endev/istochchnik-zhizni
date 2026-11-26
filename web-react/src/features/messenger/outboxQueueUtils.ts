/**
 * Если отправка сообщения с вложением не удалась, store кладёт его в outbox и сам
 * повторяет отправку. Композер при этом не должен держать то же вложение — иначе повторное
 * нажатие «Отправить» создаёт второе сообщение (другой client_msg_id), а первое доходит из очереди.
 */
export type OutboxLike = { payload?: unknown };

function payloadUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as { url?: unknown; images?: unknown };
  const urls: string[] = [];
  if (typeof p.url === 'string' && p.url) urls.push(p.url);
  if (Array.isArray(p.images)) {
    for (const img of p.images) {
      const u = (img as { url?: unknown } | null)?.url;
      if (typeof u === 'string' && u) urls.push(u);
    }
  }
  return urls;
}

export function outboxHasUploadedUrl(queue: readonly OutboxLike[], url: string): boolean {
  if (!url) return false;
  return queue.some((item) => payloadUrls(item.payload).includes(url));
}
