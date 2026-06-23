/** Пробелы/разделители из Word, PDF, iOS (в т.ч. узкие и zero-width). */
const GAP_BETWEEN_DIGITS =
  /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/u;

/** BiDi control chars — ломают отображение и копирование в Telegram/WhatsApp. */
const BIDI_CONTROL_CHARS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

const URL_IN_TEXT = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const MENTION_CANONICAL = /@\[\d+\]/g;

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

  s = s.replace(BIDI_CONTROL_CHARS, '');

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

  // Нумерация в Chrome/Yandex: «1 .» → «1.»; стихи «19 - 22» → «19-22»
  s = s.replace(/(\d)\s+([.:])/g, '$1$2');
  s = s.replace(/(\d)\s*-\s*(\d)/g, '$1-$2');

  return s;
}

/** При копировании выделения из пузыря (Chrome/Yandex BiDi) — чистый plain-text. */
export function handleMessengerTextCopy(event: { clipboardData: DataTransfer; preventDefault: () => void }): void {
  if (typeof window === 'undefined') return;
  const selected = window.getSelection()?.toString() ?? '';
  if (!selected.trim()) return;
  event.clipboardData.setData('text/plain', messengerTextForCopy(selected));
  event.preventDefault();
}

/** Текст для буфера обмена — без BiDi-артефактов и «разъехавшихся» цифр. */
export function messengerTextForCopy(text: string): string {
  return normalizeChatDisplayText(text);
}

/** Android WebView / Chrome: UA или нативная оболочка Capacitor. */
export function isAndroidMessengerClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/** Chromium (Chrome, Яндекс.Браузер, Edge) — BiDi plaintext ломает цифры в кириллице. */
export function isChromiumMessengerClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /(?:Chrome|Chromium|Edg|YaBrowser)\//i.test(navigator.userAgent);
}

function slotToken(index: number): string {
  return `\uE000${String.fromCharCode(0xe100 + index)}\uE001`;
}

function protectFromBidiMarkers(text: string): { masked: string; slots: string[] } {
  const slots: string[] = [];
  const mask = (match: string) => {
    const token = slotToken(slots.length);
    slots.push(match);
    return token;
  };
  let masked = text.replace(URL_IN_TEXT, mask);
  masked = masked.replace(MENTION_CANONICAL, mask);
  return { masked, slots };
}

function unprotectFromBidiMarkers(masked: string, slots: string[]): string {
  return masked.replace(/\uE000[\uE100-\uE1FF]\uE001/g, (token) => {
    const index = token.charCodeAt(1) - 0xe100;
    return slots[index] ?? token;
  });
}

/** LTR-маркеры вокруг цифр — только там, где нет URL и упоминаний. */
export function applyBidiLtrMarkers(text: string): string {
  const { masked, slots } = protectFromBidiMarkers(text);
  const marked = masked.replace(/(\d+)/g, '\u200E$1\u200E');
  return unprotectFromBidiMarkers(marked, slots);
}

/** @deprecated alias */
export const applyAndroidBidiLtrMarkers = applyBidiLtrMarkers;

/**
 * Нормализация для отображения в пузырях.
 * BiDi-маркеры не вставляем: цифры оборачиваются в <bdi> в renderMessengerPlainText.
 */
export function displayMessengerText(text: string): string {
  return normalizeChatDisplayText(text);
}
