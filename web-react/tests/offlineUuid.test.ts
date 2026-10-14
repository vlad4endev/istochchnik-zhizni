import { describe, expect, it } from 'vitest';

import { newClientId, newIdempotencyKey } from '../src/offline/uuidv7';

describe('offline uuidv7', () => {
  it('generates distinct ids', () => {
    const a = newClientId();
    const b = newIdempotencyKey();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(b.length).toBeGreaterThan(20);
  });
});
