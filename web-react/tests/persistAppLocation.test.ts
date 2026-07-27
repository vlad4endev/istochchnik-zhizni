import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLastAppRoute,
  isPersistableAppPath,
  readActiveMessengerConversation,
  readChatScrollAnchor,
  readFeedScrollAnchor,
  readLastAppRoute,
  saveActiveMessengerConversation,
  saveChatScrollAnchor,
  saveFeedScrollAnchor,
  saveLastAppRoute,
} from '../src/lib/persistAppLocation';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  return api;
}

describe('persistAppLocation', () => {
  beforeEach(() => {
    const local = installMemoryStorage();
    const session = installMemoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects auth and root paths for last-route persistence', () => {
    expect(isPersistableAppPath('/')).toBe(false);
    expect(isPersistableAppPath('/login')).toBe(false);
    expect(isPersistableAppPath('/auth/callback')).toBe(false);
    expect(isPersistableAppPath('/feed')).toBe(true);
    expect(isPersistableAppPath('/messenger?conversationId=1')).toBe(true);
  });

  it('saves and reads last app route', () => {
    saveLastAppRoute('/feed');
    expect(readLastAppRoute()).toBe('/feed');
    saveLastAppRoute('/');
    expect(readLastAppRoute()).toBe('/feed');
    clearLastAppRoute();
    expect(readLastAppRoute()).toBeNull();
  });

  it('persists feed scroll anchor', () => {
    saveFeedScrollAnchor({ y: 420, postId: 'p-9', sort: 'smart' });
    expect(readFeedScrollAnchor()).toEqual({ y: 420, postId: 'p-9', sort: 'smart' });
  });

  it('persists chat scroll anchor and reads legacy numeric format', () => {
    saveChatScrollAnchor('c1', { y: 120, messageId: '55', nearBottom: false });
    expect(readChatScrollAnchor('c1')).toEqual({
      y: 120,
      messageId: '55',
      nearBottom: false,
    });

    sessionStorage.setItem('messenger:chat-window-scroll-v2:c2', '88');
    expect(readChatScrollAnchor('c2')).toEqual({ y: 88, nearBottom: false });
  });

  it('persists active messenger conversation', () => {
    saveActiveMessengerConversation('42');
    expect(readActiveMessengerConversation()).toBe('42');
    saveActiveMessengerConversation(null);
    expect(readActiveMessengerConversation()).toBeNull();
  });
});
