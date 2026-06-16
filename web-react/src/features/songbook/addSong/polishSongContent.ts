import {
  convertToChordPro,
  hasLyricLetters,
  isChordOnlyLine,
  looksLikeChordPro,
  mergeChordLineWithLyrics,
} from './chordProConversion';
import { stripHiddenChordProDirectives } from '../utils/sectionMarkers';

const NON_LYRIC_LINE_PATTERNS: RegExp[] = [
  /^(?:сборник\s+песен|songbook)/i,
  /(?:«\s*)?источник\s+жизни(?:\s*»)?/i,
  /source\s+of\s+life/i,
  /^(?:источник|source|автор|author|композитор|composer|перевод|translation)\s*:/i,
  /https?:\/\//i,
  /^www\./i,
  /holychords|kgmusic|worshiptogether|genius\.com|ccli/i,
  /^[🎵♪🎶]/,
];

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Убрать строки-метаданные (сборник, источник, ссылки). */
export function stripNonLyricLines(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (NON_LYRIC_LINE_PATTERNS.some((re) => re.test(trimmed))) continue;
    out.push(line);
  }
  return out.join('\n');
}

/** Убрать пометки повтора вроде «(2р)» в конце строки. */
function stripRepeatMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s*\(\d+\s*[рpхx]+\)\s*$/iu, '').trimEnd())
    .join('\n');
}

function collapseExtraBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/** Убрать строку аккордов, если ниже уже есть ChordPro с [аккордами]. */
function removeStackedChordsOverChordPro(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isChordOnlyLine(line) && !looksLikeChordPro(line)) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? '').trim()) j += 1;
      if (looksLikeChordPro(lines[j] ?? '')) continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Склеить «висячие» строки аккордов после конвертации. */
function fixOrphanChordRows(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      out.push(line);
      continue;
    }

    if (isChordOnlyLine(line) && !looksLikeChordPro(line)) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? '').trim()) j += 1;
      const next = lines[j];
      if (next && looksLikeChordPro(next)) continue;
      if (next && hasLyricLetters(next) && !isChordOnlyLine(next)) {
        out.push(mergeChordLineWithLyrics(line, next));
        i = j;
        continue;
      }
      let prevIdx = out.length - 1;
      while (prevIdx >= 0 && !(out[prevIdx] ?? '').trim()) prevIdx -= 1;
      const prev = out[prevIdx];
      if (prev && hasLyricLetters(prev) && !isChordOnlyLine(prev) && !looksLikeChordPro(prev)) {
        out[prevIdx] = mergeChordLineWithLyrics(line, prev);
        continue;
      }
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

/**
 * Полная локальная «полировка» текста песни: метаданные, ChordPro, аккорды над строкой.
 */
export function polishSongContent(raw: string): string {
  let text = normalizeNewlines(typeof raw === 'string' ? raw : '');
  text = stripHiddenChordProDirectives(text);
  text = stripNonLyricLines(text);
  text = stripRepeatMarkers(text);
  text = removeStackedChordsOverChordPro(text);
  text = convertToChordPro(text);
  text = fixOrphanChordRows(text);
  text = collapseExtraBlankLines(text);
  return text.trimEnd();
}
