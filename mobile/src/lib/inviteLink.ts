/** Парсинг invite-ссылок: https://app…/join/TOKEN и istochnik://join/TOKEN */

export function extractInviteTokenFromUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    const u = new URL(input);
    if (u.protocol === 'istochnik:') {
      if (u.hostname === 'join' || u.host === 'join') {
        const token = u.pathname.replace(/^\//, '').split('/')[0]?.trim() ?? '';
        return token.length >= 4 ? token : null;
      }
      const fromPath = u.pathname.match(/\/join\/([^/?#]+)/i);
      const token = fromPath?.[1]?.trim() ?? '';
      return token.length >= 4 ? token : null;
    }
    const match = u.pathname.match(/\/join\/([^/?#]+)/i);
    const token = match?.[1]?.trim() ?? '';
    return token.length >= 4 ? token : null;
  } catch {
    return null;
  }
}
