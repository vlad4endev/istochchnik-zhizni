import { describe, expect, it } from 'vitest';
import {
  applyBidiLtrMarkers,
  displayMessengerText,
  normalizeChatDisplayText,
} from '../src/features/messenger/normalizeChatDisplayText';

describe('normalizeChatDisplayText', () => {
  it('collapses spaces between digits in dates and times', () => {
    expect(normalizeChatDisplayText('2 9 мая, 1 8 : 0 0')).toBe('29 мая, 18:00');
  });

  it('converts fullwidth digits to ASCII', () => {
    expect(normalizeChatDisplayText('２９ мая')).toBe('29 мая');
  });

  it('collapses narrow no-break space and zero-width between digits', () => {
    expect(normalizeChatDisplayText('2\u202f9\u200b мая')).toBe('29 мая');
  });

  it('leaves mention markup untouched', () => {
    const raw = 'Привет @[Иван](12) в 1 0 : 0 0';
    expect(normalizeChatDisplayText(raw)).toBe('Привет @[Иван](12) в 10:00');
  });
});

describe('applyBidiLtrMarkers', () => {
  it('wraps digit runs with LTR marks', () => {
    expect(applyBidiLtrMarkers('в 10?')).toBe('в \u200E10\u200E?');
    expect(applyBidiLtrMarkers('14:36')).toBe('\u200E14\u200E:\u200E36\u200E');
  });
});

describe('displayMessengerText', () => {
  it('normalizes and wraps digits on all platforms', () => {
    expect(displayMessengerText('в 1 0 ?')).toBe('в \u200E10\u200E ?');
  });
});
