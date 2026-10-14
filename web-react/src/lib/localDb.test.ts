import { describe, expect, it } from 'vitest';

import { isCacheableApiUrl, normalizeCacheUrl } from './localDb';

describe('localDb: что сохраняется в SQLite', () => {
  it('чаты, realtime и авторизация не сохраняются', () => {
    expect(isCacheableApiUrl('/api/messenger/chats')).toBe(false);
    expect(isCacheableApiUrl('/api/realtime')).toBe(false);
    expect(isCacheableApiUrl('/api/auth/me')).toBe(false);
  });
  it('остальные данные сохраняются', () => {
    expect(isCacheableApiUrl('/api/calendar/events')).toBe(true);
    expect(isCacheableApiUrl('https://app.church-tambov.ru/api/stories?x=1')).toBe(true);
  });
  it('ключ не зависит от хоста', () => {
    expect(normalizeCacheUrl('https://a.ru/api/stories?x=1')).toBe('/api/stories?x=1');
  });
});
