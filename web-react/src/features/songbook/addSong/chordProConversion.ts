import { Chord } from '@tonaljs/tonal';

/** Распознавание токена аккорда (латиница, популярные суффиксы). */
export function isChordToken(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return !Chord.get(s).empty;
}

function tokenizeChordLine(line: string): string[] {
  return line
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter(isChordToken);
}

/** Строка состоит только из аккордов и пробелов (типичная «верхняя» строка). */
export function isChordOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(isChordToken);
}

export function hasLyricLetters(line: string): boolean {
  return /[A-Za-zА-Яа-яЁё]/.test(line);
}

/** Уже в ChordPro — есть хотя бы один [аккорд]. */
export function looksLikeChordPro(line: string): boolean {
  return /\[[^\]]+\]/.test(line);
}

/**
 * Склеить пару «строка аккордов» + «строка текста» в ChordPro.
 */
export function mergeChordLineWithLyrics(chordLine: string, lyricLine: string): string {
  const chords = tokenizeChordLine(chordLine);
  const trimmedLyric = lyricLine.trimEnd();
  const words = trimmedLyric.split(/\s+/).filter(Boolean);

  if (chords.length === 0) return lyricLine;

  if (words.length === chords.length) {
    return chords.map((c, i) => `[${c}]${words[i]}`).join(' ');
  }

  if (chords.length === 1) {
    return `[${chords[0]}]${trimmedLyric}`;
  }

  if (words.length === 1) {
    return chords.map((c) => `[${c}]`).join('') + words[0];
  }

  return `${chords.map((c) => `[${c}]`).join(' ')} ${trimmedLyric}`;
}

/**
 * Конвертирует текст с аккордами «над строкой» в ChordPro (встроенные [Am]word).
 * Пустые строки сохраняются как разделители куплетов.
 */
export function convertStackedChordsToChordPro(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    if (line.trim() === '') {
      out.push('');
      i += 1;
      continue;
    }

    if (
      next !== undefined &&
      isChordOnlyLine(line) &&
      !looksLikeChordPro(line) &&
      !isChordOnlyLine(next) &&
      hasLyricLetters(next)
    ) {
      out.push(mergeChordLineWithLyrics(line, next));
      i += 2;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n');
}

/**
 * Добавляет директивы ChordPro в начало (опционально).
 */
export function buildChordProHeader(opts: {
  title?: string;
  subtitle?: string;
}): string {
  const rows: string[] = [];
  if (opts.title?.trim()) rows.push(`{title: ${opts.title.trim()}}`);
  if (opts.subtitle?.trim()) rows.push(`{subtitle: ${opts.subtitle.trim()}}`);
  return rows.length ? `${rows.join('\n')}\n\n` : '';
}
