import { describe, expect, it } from 'vitest';
import { formatMessengerAccountIdForDisplay, parseSessionIdFromScan } from '../src/features/messenger/sessionCrypto';

const SAMPLE = `05${'ab'.repeat(32)}`;

describe('sessionCrypto parse helpers', () => {
  it('parses bare account id', () => {
    expect(parseSessionIdFromScan(SAMPLE)).toBe(SAMPLE);
    expect(parseSessionIdFromScan(SAMPLE.toUpperCase())).toBe(SAMPLE);
  });

  it('parses deep link and JSON payload', () => {
    expect(parseSessionIdFromScan(`/messenger?sessionId=${SAMPLE}`)).toBe(SAMPLE);
    expect(
      parseSessionIdFromScan(JSON.stringify({ v: 1, type: 'messenger_session', id: SAMPLE })),
    ).toBe(SAMPLE);
  });

  it('rejects garbage', () => {
    expect(parseSessionIdFromScan('hello')).toBeNull();
    expect(parseSessionIdFromScan('04' + 'aa'.repeat(32))).toBeNull();
  });

  it('formats id for display', () => {
    const formatted = formatMessengerAccountIdForDisplay(SAMPLE);
    expect(formatted.startsWith('05 ')).toBe(true);
    expect(formatted.replace(/\s/g, '')).toBe(SAMPLE);
  });
});
