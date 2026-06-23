/** Пробелы/разделители из Word, PDF, iOS (в т.ч. узкие и zero-width). */
const GAP_BETWEEN_DIGITS =
  /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/u;

/** BiDi control chars — ломают отображение и копирование в Telegram/WhatsApp. */
const BIDI_CONTROL_CHARS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Приводит текст сообщений к читаемому виду: полуширинные цифры/знаки из Word/PDF
 * и лишние пробелы между цифрами («2 9 мая», «1 8 : 0 0» → «29 мая», «18:00»).
 */
export function normalizeChatDisplayText(text: string): string {
  if (!text) return text;

  let s = text.normalize('NFKC');

  s = s.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff01 + 0x21),
  );

  s = s.replace(BIDI_CONTROL_CHARS, '');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');

  let prev = '';
  const digitGap = new RegExp(`(\\d)${GAP_BETWEEN_DIGITS.source}+(\\d)`, 'gu');
  while (prev !== s) {
    prev = s;
    s = s.replace(digitGap, '$1$2');
  }

  s = s.replace(/(\d{1,2})\s*:\s*(\d{1,2})/g, '$1:$2');
  s = s.replace(/(\d)\s+([.:])/g, '$1$2');
  s = s.replace(/(\d)\s*-\s*(\d)/g, '$1-$2');

  return s;
}

/** Текст для буфера обмена — без BiDi-артефактов и «разъехавшихся» цифр. */
export function messengerTextForCopy(text: string): string {
  return normalizeChatDisplayText(text);
}
