/**
 * Маркер блока песни (куплет, припев…) — отдельная строка в ChordPro-тексте.
 * Формат: {sec:Название}
 */
export const SECTION_MARKER_LINE_RE = /^\{sec:\s*([^}]*?)\s*\}\s*$/i;

export function parseSectionTitle(line: string): string | null {
  const m = line.trim().match(SECTION_MARKER_LINE_RE);
  if (!m) return null;
  const t = m[1]?.trim() ?? '';
  return t.length > 0 ? t : null;
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
