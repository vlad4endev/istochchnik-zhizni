/**
 * Сохранение последнего маршрута и позиции скролла приложения
 * (PWA / WebView: при убийстве процесса in-memory state теряется).
 */

const LAST_ROUTE_KEY = 'app:last-route-v1';
const SCROLL_PREFIX = 'app:scroll-v1:';

const AUTH_PREFIXES = ['/login', '/auth', '/register', '/offline'];

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function isPersistableAppPath(pathWithSearch: string): boolean {
  const path = pathWithSearch.split('?')[0] || '/';
  if (path === '/' || path === '') return false;
  return !AUTH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function saveLastAppRoute(pathWithSearch: string): void {
  if (!canUseStorage()) return;
  if (!isPersistableAppPath(pathWithSearch)) return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, pathWithSearch);
  } catch {
    /* quota / private mode */
  }
}

export function readLastAppRoute(): string | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY);
    if (!raw || !isPersistableAppPath(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearLastAppRoute(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(LAST_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}

export function scrollStorageKey(routeKey: string): string {
  return `${SCROLL_PREFIX}${routeKey}`;
}

export function saveRouteScroll(routeKey: string, y: number): void {
  if (!canUseStorage()) return;
  if (!Number.isFinite(y) || y < 0) return;
  try {
    localStorage.setItem(scrollStorageKey(routeKey), String(Math.round(y)));
  } catch {
    /* ignore */
  }
}

export function readRouteScroll(routeKey: string): number | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(scrollStorageKey(routeKey));
    if (raw == null) return null;
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}

/** Лента: якорь по id поста + scrollTop (на случай если пост ещё не в DOM). */
export type FeedScrollAnchor = {
  y: number;
  postId?: string;
  sort?: string;
};

const FEED_SCROLL_KEY = 'app:feed-scroll-v1';

export function saveFeedScrollAnchor(anchor: FeedScrollAnchor): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(FEED_SCROLL_KEY, JSON.stringify(anchor));
  } catch {
    /* ignore */
  }
}

export function readFeedScrollAnchor(): FeedScrollAnchor | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(FEED_SCROLL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedScrollAnchor;
    if (!parsed || typeof parsed.y !== 'number' || !Number.isFinite(parsed.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Чат: scrollTop + id сообщения в зоне видимости (virtual list меняет высоты). */
export type ChatScrollAnchor = {
  y: number;
  messageId?: string;
  nearBottom?: boolean;
};

export function chatScrollStorageKey(conversationId: string): string {
  return `messenger:chat-window-scroll-v2:${conversationId}`;
}

function legacyChatScrollStorageKey(conversationId: string): string {
  return `messenger:chat-window-scroll:${conversationId}`;
}

export function saveChatScrollAnchor(conversationId: string, anchor: ChatScrollAnchor): void {
  if (!canUseStorage() || typeof sessionStorage === 'undefined') return;
  try {
    const payload = JSON.stringify(anchor);
    sessionStorage.setItem(chatScrollStorageKey(conversationId), payload);
    // Дублируем в localStorage: iOS иногда чистит sessionStorage при убийстве PWA.
    localStorage.setItem(chatScrollStorageKey(conversationId), payload);
  } catch {
    /* ignore */
  }
}

export function readChatScrollAnchor(conversationId: string): ChatScrollAnchor | null {
  if (!canUseStorage()) return null;
  const key = chatScrollStorageKey(conversationId);
  const legacyKey = legacyChatScrollStorageKey(conversationId);
  try {
    const raw =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null) ??
      localStorage.getItem(key) ??
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(legacyKey) : null) ??
      localStorage.getItem(legacyKey);
    if (!raw) return null;
    // Старый формат: просто число scrollTop
    if (/^\d+(\.\d+)?$/.test(raw.trim())) {
      const y = Number(raw);
      // В чате scrollTop>0 = пользователь ушёл от «верха истории»; не прилипаем к низу.
      return Number.isFinite(y) ? { y, nearBottom: y <= 0 } : null;
    }
    const parsed = JSON.parse(raw) as ChatScrollAnchor;
    if (!parsed || typeof parsed.y !== 'number' || !Number.isFinite(parsed.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearChatScrollAnchor(conversationId: string): void {
  if (!canUseStorage()) return;
  const key = chatScrollStorageKey(conversationId);
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const ACTIVE_CONV_KEY = 'messenger:active-conversation-v1';

export function saveActiveMessengerConversation(id: string | null): void {
  if (!canUseStorage()) return;
  try {
    if (!id) {
      localStorage.removeItem(ACTIVE_CONV_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_CONV_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readActiveMessengerConversation(): string | null {
  if (!canUseStorage()) return null;
  try {
    const id = localStorage.getItem(ACTIVE_CONV_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}
