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

  // Схлопываем пробелы между соседними цифрами (повторно для цепочек вроде «1 8 : 0 0»)
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/(\d)\s+(\d)/g, '$1$2');
  }

  // Время и диапазоны: «18 : 00» → «18:00», «10 - 12» без лишних пробелов у «:»
  s = s.replace(/(\d{1,2})\s*:\s*(\d{1,2})/g, '$1:$2');

  return s;
}
