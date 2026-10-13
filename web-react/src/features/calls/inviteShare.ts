/** Текст для буфера / шаринга: название и ссылка. */
export function formatInviteShareText(title: string, url: string): string {
  const name = title.trim() || 'Встреча';
  const link = url.trim();
  if (!link) return name;
  return `${name}\n${link}`;
}

export async function copyInviteShare(title: string, url: string): Promise<boolean> {
  const text = formatInviteShareText(title, url);
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Системный share sheet (если есть) или копирование в буфер.
 * В text всегда «название\\nссылка», чтобы в Telegram/WhatsApp ушло оба.
 */
export async function shareInviteLink(
  title: string,
  url: string,
): Promise<'shared' | 'copied' | 'failed'> {
  const name = title.trim() || 'Встреча';
  const link = url.trim();
  if (!link) return 'failed';
  const text = formatInviteShareText(name, link);

  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    canShare?: (data: { title?: string; text?: string; url?: string }) => boolean;
  };

  if (typeof nav.share === 'function') {
    const payload = { title: name, text };
    try {
      if (typeof nav.canShare !== 'function' || nav.canShare(payload)) {
        await nav.share(payload);
        return 'shared';
      }
    } catch (e) {
      // AbortError = пользователь закрыл sheet — не копируем повторно.
      if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
    }
  }

  const ok = await copyInviteShare(name, link);
  return ok ? 'copied' : 'failed';
}
