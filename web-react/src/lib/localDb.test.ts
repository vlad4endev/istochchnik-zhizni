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

import { isQueueableWrite } from './localDb';

describe('localDb: какие записи ждут сеть', () => {
  it('безопасные действия ставятся в очередь', () => {
    expect(isQueueableWrite('POST', '/api/calendar/prayer-need/submit')).toBe(true);
    expect(isQueueableWrite('patch', '/api/music-schedule/assignments/5/status')).toBe(true);
    expect(isQueueableWrite('post', '/api/notifications/deliveries/7/open')).toBe(true);
  });
  it('чаты, звонки и прочее — нет', () => {
    expect(isQueueableWrite('post', '/api/messenger/messages')).toBe(false);
    expect(isQueueableWrite('post', '/api/calls/1/accept')).toBe(false);
    expect(isQueueableWrite('delete', '/api/posts/3')).toBe(false);
    expect(isQueueableWrite('post', '/api/auth/login')).toBe(false);
  });
});
