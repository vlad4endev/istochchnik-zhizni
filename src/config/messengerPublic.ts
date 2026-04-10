/**
 * Публичный URL веб-приложения мессенджера (другой поддомен).
 * Примеры: https://chat.church-tambov.ru — без завершающего слэша.
 */
export function resolveMessengerPublicWebBase(): string {
  const raw = (process.env.MESSENGER_PUBLIC_ORIGIN ?? '').trim();
  return raw.replace(/\/+$/, '');
}

/** Ссылка для push / deep link: абсолютная при заданном MESSENGER_PUBLIC_ORIGIN, иначе относительный путь (legacy). */
export function resolveMessengerConversationDeepLink(conversationId: string): string {
  const base = resolveMessengerPublicWebBase();
  const q = `conversationId=${encodeURIComponent(conversationId)}`;
  if (base) {
    return `${base}/?${q}`;
  }
  return `/messenger?${q}`;
}
