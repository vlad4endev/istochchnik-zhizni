/**
 * Маркер блока песни (куплет, припев…) — отдельная строка в ChordPro-тексте.
 * Формат: {sec:Название}
 */
export const SECTION_MARKER_LINE_RE = /^\{sec:\s*([^}]*?)\s*\}\s*$/i;
const COMMENT_MARKER_LINE_RE = /^\{(?:comment|c):\s*([^}]*?)\s*\}\s*$/i;
const BRACKET_TITLE_LINE_RE = /^\[\s*([^\]]+?)\s*\]\s*$/;
const PLAIN_SECTION_LINE_RE =
  /^\s*(куплет|припев|бридж|проигрыш|verse|chorus|bridge|intro|outro)\s*([0-9ivx]+)?\s*:?\s*$/i;
const START_SECTION_RE = /^\{(?:start_of_|s)(chorus|verse|bridge)\}\s*$/i;
const END_SECTION_RE = /^\{(?:end_of_|e)(chorus|verse|bridge)\}\s*$/i;
const SHORT_START_SECTION_RE = /^\{(soc|sov|sob)\}\s*$/i;
const SHORT_END_SECTION_RE = /^\{(eoc|eov|eob)\}\s*$/i;

function normalizeSectionName(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^(chorus)$/i.test(t)) return 'Припев';
  if (/^(verse)$/i.test(t)) return 'Куплет';
  if (/^(bridge)$/i.test(t)) return 'Бридж';
  if (/^(intro)$/i.test(t)) return 'Вступление';
  if (/^(outro)$/i.test(t)) return 'Аутро';
  return t;
}

export function parseSectionTitle(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const sec = trimmed.match(SECTION_MARKER_LINE_RE);
  if (sec) {
    const t = normalizeSectionName(sec[1] ?? '');
    return t.length > 0 ? t : null;
  }

  const comment = trimmed.match(COMMENT_MARKER_LINE_RE);
  if (comment) {
    const t = normalizeSectionName(comment[1] ?? '');
    return t.length > 0 ? t : null;
  }

  const start = trimmed.match(START_SECTION_RE);
  if (start) return normalizeSectionName(start[1] ?? '');
  const shortStart = trimmed.match(SHORT_START_SECTION_RE);
  if (shortStart) {
    const token = (shortStart[1] ?? '').toLowerCase();
    if (token === 'soc') return 'Припев';
    if (token === 'sov') return 'Куплет';
    if (token === 'sob') return 'Бридж';
  }
  if (END_SECTION_RE.test(trimmed)) return null;
  if (SHORT_END_SECTION_RE.test(trimmed)) return null;

  const plain = trimmed.match(PLAIN_SECTION_LINE_RE);
  if (plain) {
    const base = normalizeSectionName(plain[1] ?? '');
    const n = (plain[2] ?? '').trim();
    return n ? `${base} ${n}` : base;
  }

  const bracket = trimmed.match(BRACKET_TITLE_LINE_RE);
  if (bracket) {
    const title = bracket[1]?.trim() ?? '';
    // Не считаем аккорды вида [Am], [F#7], [Bbmaj7] заголовками секций.
    if (!title || /^[A-G][#b]?(?:m|maj|min|sus|dim|aug|add|\d|\/|-| )*$/i.test(title)) {
      return null;
    }
    return normalizeSectionName(title);
  }

  return null;
}

export function buildSectionMarker(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ').replace(/}/g, '');
  return `{sec:${t}}`;
}

/** Для экспорта в плоский текст/PDF — подзаголовок вместо директивы. */
export function sectionLinesToPlainHeadings(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const t = parseSectionTitle(line);
      if (t !== null) return `— ${t} —`;
      return line;
    })
    .join('\n');
}
