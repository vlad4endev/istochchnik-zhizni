/**
 * Раскодирует числовые и именованные HTML-сущности в обычный текст.
 * Используется для текста песен после импорта, когда в БД попали литералы вида `&#092;`, `&#33;`.
 * До трёх проходов — на случай двойного экранирования (`&amp;#33;`).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  if (typeof document === 'undefined') {
    return decodeHtmlEntitiesNumeric(text);
  }
  let cur = text;
  for (let i = 0; i < 3; i++) {
    const ta = document.createElement('textarea');
    ta.innerHTML = cur;
    const next = ta.value;
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function decodeHtmlEntitiesNumeric(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
