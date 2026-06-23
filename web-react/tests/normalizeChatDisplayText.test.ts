import { describe, expect, it } from 'vitest';
import {
  applyBidiLtrMarkers,
  displayMessengerText,
  messengerTextForCopy,
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

  it('strips bidi control characters', () => {
    expect(normalizeChatDisplayText('в \u200E10\u200E июня')).toBe('в 10 июня');
  });

  it('leaves mention markup untouched', () => {
    const raw = 'Привет @[Иван](12) в 1 0 : 0 0';
    expect(normalizeChatDisplayText(raw)).toBe('Привет @[Иван](12) в 10:00');
  });

  it('keeps URLs intact without spaces inside uuid', () => {
    const url = 'https://app.church-tambov.ru/service-plan/share/54f17666-b943-41e6-8de9-3c57f5d58e28';
    expect(normalizeChatDisplayText(url)).toBe(url);
    expect(messengerTextForCopy(`Ссылка: ${url}`)).toBe(`Ссылка: ${url}`);
  });
});

describe('applyBidiLtrMarkers', () => {
  it('wraps digit runs with LTR marks', () => {
    expect(applyBidiLtrMarkers('в 10?')).toBe('в \u200E10\u200E?');
    expect(applyBidiLtrMarkers('14:36')).toBe('\u200E14\u200E:\u200E36\u200E');
  });

  it('does not insert markers inside URLs', () => {
    const url = 'https://app.church-tambov.ru/service-plan/share/54f17666-b943-41e6-8de9-3c57f5d58e28';
    expect(applyBidiLtrMarkers(`Ссылка: ${url}`)).toBe(`Ссылка: ${url}`);
  });
});

describe('displayMessengerText', () => {
  it('normalizes without bidi markers (bdi in React handles digits)', () => {
    expect(displayMessengerText('в 1 0 ?')).toBe('в 10 ?');
  });
});
