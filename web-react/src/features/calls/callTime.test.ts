import { describe, expect, it } from 'vitest';

import { formatCallDuration } from './callTime';

describe('formatCallDuration', () => {
  it('минуты и секунды', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(65.9)).toBe('1:05');
    expect(formatCallDuration(754)).toBe('12:34');
  });

  it('часы и отрицательные значения', () => {
    expect(formatCallDuration(3725)).toBe('1:02:05');
    expect(formatCallDuration(-5)).toBe('0:00');
  });
});
