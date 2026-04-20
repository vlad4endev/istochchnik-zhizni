import { Chord } from '@tonaljs/tonal';

const NORM_CACHE = new Map<string, string | null>();
const NORM_CACHE_MAX = 800;

function cacheSet(key: string, val: string | null) {
  if (NORM_CACHE.size > NORM_CACHE_MAX) {
    const first = NORM_CACHE.keys().next().value;
    if (first !== undefined) NORM_CACHE.delete(first);
  }
  NORM_CACHE.set(key, val);
}

/** «Нет аккорда» в разметке — не ломаем строку аккордов. */
export function isNoChordPlaceholder(raw: string): boolean {
  const t = raw
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .toLowerCase();
  return t === 'nc' || t === 'tacet' || t === '—' || t === '–' || t === '-' || t === '…' || t === '...';
}

/** Табы → пробелы одной ширины (как в редакторе), чтобы совпали колонки аккорд/текст. */
export function expandTabsToSpaces(line: string, tabWidth = 8): string {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\t') {
      const pad = tabWidth - (out.length % tabWidth);
      out += ' '.repeat(pad === 0 ? tabWidth : pad);
    } else {
      out += ch;
    }
  }
  return out;
}

function buildChordParseVariants(input: string): string[] {
  let s = input.trim().normalize('NFKC');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/♯/g, '#').replace(/♭/g, 'b');
  const out = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (t) out.add(t);
  };
  add(s);

  // Разделённые точкой сомнения: «Am.» в PDF
  add(s.replace(/\.+$/u, ''));

  // Полутоновое уменьшение ø → m7b5
  if (s.includes('ø')) add(s.replace(/ø/g, 'm7b5'));

  // Maj7 в нотной записи
  if (/[∆Δ]/.test(s)) add(s.replace(/[∆Δ]/g, 'maj'));
  if (s.includes('^')) add(s.replace(/\^/g, 'maj'));

  // Уменьшенный: градусы ° º или суффикс o (латинская o)
  if (/[°º]$/u.test(s)) {
    const b = s.replace(/[°º]+$/u, '').trimEnd();
    if (b) {
      add(`${b}dim`);
      add(`${b}o`);
    }
  }
  if (/^[A-G](?:#|b)?o$/i.test(s)) add(s.replace(/o$/i, 'dim'));

  // sus без номера → sus4
  if (/sus$/i.test(s) && !/sus[24]/i.test(s)) add(s.replace(/sus$/i, 'sus4'));

  // CM7, F#M9 — джазовая запись большой септимы/расширений
  if (/^([A-G](?:#|b)?)M(7|9|11|13)$/i.test(s)) add(s.replace(/M(7|9|11|13)$/i, 'maj$1'));

  // Регистр корня a–g (только строчные корни, не трогаем F# и т.д.)
  {
    const first = s[0];
    if (first >= 'a' && first <= 'g') add(first.toUpperCase() + s.slice(1));
  }

  // Нем.: hm → Hm → далее H → B
  if (s[0] === 'h' && /^h(m|maj|dim|aug|sus|add|7|9|11|13|6|\/)/i.test(s)) add(`H${s.slice(1)}`);

  // Нем. H = ноте B (осторожно: только короткие токены с типичными суффиксами аккорда)
  if (/^H(m|maj|dim|aug|sus|add|7|9|11|13|6|\/)/i.test(s)) add(`B${s.slice(1)}`);
  if (/^Hb/i.test(s)) add(`Bb${s.slice(2)}`);

  // × как maj7 в старых партитурах
  if (/×/.test(s)) add(s.replace(/×/g, 'maj'));

  return [...out];
}

/**
 * Приводит символ аккорда к каноническому виду Tonal (как в приложении: транспозиция, диаграммы).
 * Возвращает null, если строка не похожа на аккорд.
 */
export function normalizeChordSymbolForCatalog(raw: string): string | null {
  const key = raw.trim().normalize('NFKC');
  if (!key) return null;
  if (isNoChordPlaceholder(raw)) return null;
  if (NORM_CACHE.has(key)) {
    return NORM_CACHE.get(key) ?? null;
  }

  for (const v of buildChordParseVariants(key)) {
    const c = Chord.get(v);
    if (!c.empty && c.symbol) {
      cacheSet(key, c.symbol);
      return c.symbol;
    }
  }
  cacheSet(key, null);
  return null;
}

/** Распознавание токена аккорда (расширенные варианты записи). */
export function isChordToken(raw: string): boolean {
  return normalizeChordSymbolForCatalog(raw) != null;
}

function tokenizeChordLine(line: string): string[] {
  const exp = expandTabsToSpaces(line, 8);
  const t = exp.replace(/\|/g, ' ').trim();
  return t
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((p) => !isNoChordPlaceholder(p))
    .map((p) => normalizeChordSymbolForCatalog(p))
    .filter((x): x is string => x != null);
}

/** Список канонических аккордов из одной строки аккордов (табы, тактовые черты, N.C.). */
export function listChordSymbolsInChordLine(line: string): string[] {
  return tokenizeChordLine(line);
}

/** Строка состоит только из аккордов, тактовых черт и «N.C.» и т.п. */
export function isChordOnlyLine(line: string): boolean {
  const exp = expandTabsToSpaces(line, 8).trimEnd();
  const t = exp.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  const substantive = parts.filter((p) => !isNoChordPlaceholder(p));
  if (substantive.length === 0) return false;
  return substantive.every((p) => isChordToken(p));
}

export function hasLyricLetters(line: string): boolean {
  return /[A-Za-zА-Яа-яЁё]/.test(line);
}

/** Уже в ChordPro — есть хотя бы один [аккорд]. */
export function looksLikeChordPro(line: string): boolean {
  return /\[[^\]]+\]/.test(line);
}

/**
 * Исправляет частый сбой импорта/PDF: аккорд оказался внутри слова («Б[C]ога» вместо «[C]Бога»).
 * Повторяется, пока есть совпадения (макс. 20 шагов). Не трогает «он [Am]» с пробелом перед «[».
 */
export function normalizeSplitWordChordsInLine(line: string): string {
  let cur = line;
  for (let step = 0; step < 20; step++) {
    const next = cur.replace(
      /([\u0400-\u04FFA-Za-z])(\[[^\]]{1,24}\])([\u0400-\u04FFA-Za-z]+)/gu,
      (full, a: string, bracketed: string, rest: string) => {
        const inner = bracketed.slice(1, -1);
        if (!isChordToken(inner)) return full;
        return `${bracketed}${a}${rest}`;
      },
    );
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

export function normalizeSplitWordChordsInText(text: string): string {
  return text.split('\n').map((ln) => normalizeSplitWordChordsInLine(ln)).join('\n');
}

/**
 * Слияние по позициям символов: аккорды «над» буквами в моноширинной вёрстке.
 */
function mergeByColumnPositions(chordLine: string, lyricLine: string): string | null {
  const chordExp = expandTabsToSpaces(chordLine, 8);
  const lyricExp = expandTabsToSpaces(lyricLine, 8);
  const chords: { chord: string; pos: number }[] = [];
  for (const match of chordExp.matchAll(/\S+/g)) {
    const tok = match[0];
    if (isNoChordPlaceholder(tok)) continue;
    const norm = normalizeChordSymbolForCatalog(tok);
    if (norm == null) return null;
    chords.push({ chord: norm, pos: match.index ?? 0 });
  }
  if (chords.length === 0) return null;

  const lyrics = lyricExp;
  const maxPos = Math.max(...chords.map((c) => c.pos));
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
  const chordExp = expandTabsToSpaces(chordLine, 8);
  const lyricExp = expandTabsToSpaces(lyricLine, 8);
  const chords = tokenizeChordLine(chordLine);
  const trimmedLyric = lyricExp.trimEnd();
  const words = trimmedLyric.split(/\s+/).filter(Boolean);

  if (chords.length === 0) return lyricLine;

  if (words.length === chords.length) {
    return chords.map((c, i) => `[${c}]${words[i]}`).join(' ');
  }

  const column = mergeByColumnPositions(chordExp, lyricExp);
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

/**
 * Приводит уже вставленные [Am] [f#m7b5] к каноническим символам Tonal.
 * Содержимое вроде [verse] не трогаем.
 */
export function normalizeChordProBracketsInText(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, (full, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return full;
    const norm = normalizeChordSymbolForCatalog(trimmed);
    if (norm) return `[${norm}]`;
    return full;
  });
}

/**
 * Полная конвертация: «надстрочные» аккорды + канонизация всех [аккордов] в тексте.
 */
export function convertToChordPro(raw: string): string {
  const stacked = convertStackedChordsToChordPro(raw);
  return normalizeChordProBracketsInText(stacked);
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
