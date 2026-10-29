import { describe, expect, it } from 'vitest';

import { formatBroadcastStartsAt, formatEventDateRu } from './format';

describe('publicSite format', () => {
  it('formats event date and time in ru style', () => {
    const s = formatEventDateRu('2026-10-29', '11:00:00');
    expect(s).toContain('29.10.2026');
    expect(s).toContain('11:00');
  });

  it('formats broadcast starts_at wall clock', () => {
    expect(formatBroadcastStartsAt('2026-10-29 18:30:00')).toBe('29.10.2026 · 18:30');
  });

  it('handles empty broadcast time', () => {
    expect(formatBroadcastStartsAt(null)).toBe('');
  });
});
