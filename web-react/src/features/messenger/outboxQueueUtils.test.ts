import { describe, expect, it } from 'vitest';

import { outboxHasUploadedUrl } from './outboxQueueUtils';

describe('outboxHasUploadedUrl', () => {
  it('finds single-file payloads', () => {
    expect(outboxHasUploadedUrl([{ payload: { url: '/u/a.pdf' } }], '/u/a.pdf')).toBe(true);
  });
  it('finds album payloads by any image url', () => {
    const q = [{ payload: { url: '/u/1.jpg', images: [{ url: '/u/1.jpg' }, { url: '/u/2.jpg' }] } }];
    expect(outboxHasUploadedUrl(q, '/u/2.jpg')).toBe(true);
  });
  it('ignores other urls, empty urls and junk payloads', () => {
    expect(outboxHasUploadedUrl([{ payload: { url: '/u/a' } }, { payload: null }, {}], '/u/b')).toBe(false);
    expect(outboxHasUploadedUrl([{ payload: { url: '' } }], '')).toBe(false);
  });
});
