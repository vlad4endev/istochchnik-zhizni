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
 * Слияние по позициям символов: аккорды «над» буквами в моноширинной вёрстке.
 * Идея как в convertToChordPro: индекс начала токена аккорда = индекс в строке текста.
 */
function mergeByColumnPositions(chordLine: string, lyricLine: string): string | null {
  const chords: { chord: string; pos: number }[] = [];
  for (const match of chordLine.matchAll(/\S+/g)) {
    const tok = match[0];
    if (!isChordToken(tok)) return null;
    chords.push({ chord: tok, pos: match.index ?? 0 });
  }
  if (chords.length === 0) return null;

  const lyrics = lyricLine;
  const maxPos = Math.max(...chords.map((c) => c.pos));
  /** Если аккорды «уехали» правее текста — колонки не совпали, лучше другая эвристика. */
  if (maxPos > lyrics.length) return null;

  let merged = '';
  let lastPos = 0;
  const L = lyrics.length;
  for (const { chord, pos } of chords) {
    const p = Math.min(Math.max(pos, lastPos), L);
    merged += lyrics.slice(lastPos, p) + `[${chord}]`;
    lastPos = p;
  }
  merged += lyrics.slice(lastPos);
  return merged;
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

  const column = mergeByColumnPositions(chordLine, lyricLine);
  if (column != null) return column;

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

/** Алиас: полная конвертация вставленного текста в ChordPro. */
export const convertToChordPro = convertStackedChordsToChordPro;

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
