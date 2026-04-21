import { describe, expect, it } from 'vitest';

import { splitGraphemeClusters } from '../src/features/songbook/utils/graphemeClusters';

describe('splitGraphemeClusters', () => {
  it('splits cyrillic and latin', () => {
    expect(splitGraphemeClusters('ПриA')).toEqual(['П', 'р', 'и', 'A']);
  });

  it('round-trips non-empty input', () => {
    const s = 'Строка 1\nи ещё';
    expect(splitGraphemeClusters(s).join('')).toBe(s);
  });
});
