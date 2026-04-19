/**
 * На узком экране чат может оставаться «выбранным» в store, пока пользователь
 * смотрит список диалогов (`data-chat-open` снят). Тогда не считаем поверхность чата открытой
 * для mark-as-read / WS auto-read.
 */
export function isMessengerChatReadSurfaceOpen(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (!window.matchMedia('(max-width: 768px)').matches) return true;
  return document.documentElement.dataset.chatOpen === '1';
}
