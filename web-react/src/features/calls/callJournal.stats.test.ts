import { describe, expect, it } from 'vitest';

import { lossRatio } from './callJournal';

describe('lossRatio', () => {
  it('доля потерь от всех входящих пакетов', () => {
    expect(lossRatio(5, 95)).toBe(0.05);
    expect(lossRatio(0, 1000)).toBe(0);
  });
  it('нет пакетов — нет оценки', () => {
    expect(lossRatio(0, 0)).toBeNull();
  });
});
