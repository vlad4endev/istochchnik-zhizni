import { describe, expect, it } from 'vitest';

import {
  birthDayMonthToApiYmd,
  daysInBirthMonth,
  formatBirthDateDisplay,
  isValidBirthDayMonth,
  parseBirthDayMonthFromApi,
} from '../src/lib/birthDate';

describe('birthDate helpers', () => {
  it('builds API ymd from day and month', () => {
    expect(birthDayMonthToApiYmd(5, 3)).toBe('2000-03-05');
    expect(birthDayMonthToApiYmd(29, 2)).toBe('2000-02-29');
    expect(birthDayMonthToApiYmd(31, 4)).toBeNull();
  });

  it('parses day and month from API ymd', () => {
    expect(parseBirthDayMonthFromApi('2000-07-19')).toEqual({ day: '19', month: '7' });
    expect(parseBirthDayMonthFromApi('')).toEqual({ day: '', month: '' });
    expect(parseBirthDayMonthFromApi('not-a-date')).toEqual({ day: '', month: '' });
  });

  it('parses ISO timestamps by calendar prefix (no timezone shift)', () => {
    expect(parseBirthDayMonthFromApi('2000-03-15T00:00:00.000Z')).toEqual({
      day: '15',
      month: '3',
    });
    expect(formatBirthDateDisplay('2000-03-15T21:00:00.000Z')).toBe('15 марта');
  });

  it('validates leap-year February against placeholder year 2000', () => {
    expect(isValidBirthDayMonth(29, 2)).toBe(true);
    expect(daysInBirthMonth(2)).toBe(29);
    expect(isValidBirthDayMonth(30, 2)).toBe(false);
  });

  it('formats display in Russian', () => {
    expect(formatBirthDateDisplay('2000-01-01')).toBe('1 января');
    expect(formatBirthDateDisplay('2000-12-31')).toBe('31 декабря');
  });
});
