/** Пробелы/разделители из Word, PDF, iOS (в т.ч. узкие и zero-width). */
const GAP_BETWEEN_DIGITS =
  /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/u;

/**
 * Приводит текст сообщений к читаемому виду: полуширинные цифры/знаки из Word/PDF
 * и лишние пробелы между цифрами («2 9 мая», «1 8 : 0 0» → «29 мая», «18:00»).
 */
export function normalizeChatDisplayText(text: string): string {
  if (!text) return text;

  let s = text.normalize('NFKC');

  // Fullwidth ASCII digits and punctuation (U+FF01–FF5E)
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff01 + 0x21),
  );

  // Zero-width между символами (частый артефакт копирования)
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Схлопываем любые «щели» между соседними цифрами (цепочки вроде «1 8 : 0 0»)
  let prev = '';
  const digitGap = new RegExp(`(\\d)${GAP_BETWEEN_DIGITS.source}+(\\d)`, 'gu');
  while (prev !== s) {
    prev = s;
    s = s.replace(digitGap, '$1$2');
  }

  // Время: «18 : 00» → «18:00»
  s = s.replace(/(\d{1,2})\s*:\s*(\d{1,2})/g, '$1:$2');

  return s;
}
