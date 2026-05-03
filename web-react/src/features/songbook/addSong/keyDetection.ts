import { Chord, Key } from '@tonaljs/tonal';

import {
  hasLyricLetters,
  isChordOnlyLine,
  looksLikeChordPro,
  listChordSymbolsInChordLine,
  normalizeChordSymbolForCatalog,
} from './chordProConversion';

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Извлечь аккорды: сначала из [ChordPro], иначе из «голых» строк аккордов. */
export function extractChordsFromText(text: string): string[] {
  const fromBrackets: string[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1].trim();
    const norm = normalizeChordSymbolForCatalog(inner);
    if (norm) fromBrackets.push(norm);
  }
  if (fromBrackets.length > 0) return fromBrackets;

  const stacked: string[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (
      next !== undefined &&
      isChordOnlyLine(line) &&
      !looksLikeChordPro(line) &&
      !isChordOnlyLine(next) &&
      hasLyricLetters(next)
    ) {
      listChordSymbolsInChordLine(line).forEach((c) => stacked.push(c));
      i += 1;
    }
  }
  return stacked;
}

export type KeyGuess = {
  label: string;
  confidence: 'high' | 'medium' | 'low';
  detail: string;
};

/**
 * Эвристика: перебор мажор/минор тональностей — ищем, где первый и последний аккорд
 * совпадают с диатоническими ступенями (триады).
 */
export function guessKeyFromChords(chords: string[]): KeyGuess | null {
  if (chords.length === 0) return null;
  const first = Chord.get(chords[0]);
  const last = Chord.get(chords[chords.length - 1]);
  if (first.empty || last.empty) return null;

  for (const tonic of ROOTS) {
    const major = Key.majorKey(tonic);
    const triadsMaj = major.triads.map((t: string) => Chord.get(t).symbol);
    if (triadsMaj.includes(first.symbol) && triadsMaj.includes(last.symbol)) {
      return {
        label: `${tonic} major`,
        confidence: 'high',
        detail: `Первый аккорд «${first.symbol}», последний «${last.symbol}» — оба в мажорной тональности ${tonic}.`,
      };
    }
  }

  for (const tonic of ROOTS) {
    const minor = Key.minorKey(tonic).natural;
    const triadsMin = minor.triads.map((t: string) => Chord.get(t).symbol);
    if (triadsMin.includes(first.symbol) && triadsMin.includes(last.symbol)) {
      return {
        label: `${tonic} minor`,
        confidence: 'high',
        detail: `Первый «${first.symbol}», последний «${last.symbol}» — в натуральном миноре ${tonic}.`,
      };
    }
  }

  const tonicGuess = first.tonic;
  if (tonicGuess) {
    return {
      label: `${tonicGuess} (по первому аккорду)`,
      confidence: 'low',
      detail: `Точное совпадение тональности не найдено; ориентир — тоника первого аккорда «${first.symbol}».`,
    };
  }

  return null;
}
