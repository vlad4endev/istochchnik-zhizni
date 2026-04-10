import { Chord, Note } from '@tonaljs/tonal';
import guitarData from '@tombatossals/chords-db/lib/guitar.json';

export function transposeChordSymbol(symbol: string, semitones: number): string {
  const s = symbol.trim();
  if (!s || semitones === 0) return s;
  const dir = semitones > 0 ? '2m' : '-2m';
  let out = s;
  const n = Math.abs(semitones);
  for (let i = 0; i < n; i++) {
    const next = Chord.transpose(out, dir);
    if (next === out) return s;
    out = next;
  }
  return out;
}

/** Транспонировать только аккорды в квадратных скобках, например [Am] [Fmaj7]. */
export function transposeBracketChords(text: string, semitones: number): string {
  if (semitones === 0) return text;
  return text.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const t = transposeChordSymbol(inner, semitones);
    return `[${t}]`;
  });
}

const TYPE_TO_SUFFIX: Record<string, string> = {
  major: 'major',
  minor: 'minor',
  diminished: 'dim',
  'diminished seventh': 'dim7',
  augmented: 'aug',
  'dominant seventh': '7',
  'major seventh': 'maj7',
  'minor seventh': 'm7',
  'half-diminished': 'm7b5',
  'minor sixth': 'm6',
  sixth: '6',
  'sixth ninth': '69',
  ninth: '9',
  eleventh: '11',
  thirteenth: '13',
  sus2: 'sus2',
  sus4: 'sus4',
  'suspended second': 'sus2',
  'suspended fourth': 'sus4',
};

function resolveDbKey(tonic: string): string | null {
  const keys = guitarData.keys as string[];
  const chroma = Note.chroma(tonic);
  if (chroma == null) return null;
  return keys.find((k) => Note.chroma(k) === chroma) ?? null;
}

function resolveSuffix(c: ReturnType<typeof Chord.get>): string {
  const suffixes = guitarData.suffixes as string[];
  const fromType = c.type ? TYPE_TO_SUFFIX[c.type] : undefined;
  if (fromType && suffixes.includes(fromType)) return fromType;
  const aliases = c.aliases ?? [];
  for (const a of aliases) {
    if (suffixes.includes(a)) return a;
  }
  return 'major';
}

export type GuitarDiagramPosition = {
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
};

export function lookupGuitarPosition(symbol: string): GuitarDiagramPosition | null {
  const c = Chord.get(symbol.trim());
  if (c.empty || !c.tonic) return null;
  const dbKey = resolveDbKey(c.tonic);
  if (!dbKey) return null;
  const chordsMap = guitarData.chords as unknown as Record<
    string,
    Array<{ suffix: string; positions: GuitarDiagramPosition[] }> | undefined
  >;
  const list = chordsMap[dbKey];
  if (!Array.isArray(list)) return null;
  const suffix = resolveSuffix(c);
  const entry = list.find((x) => x.suffix === suffix);
  const pos = entry?.positions?.[0];
  if (!pos) return null;
  return {
    frets: pos.frets,
    fingers: pos.fingers ?? [],
    baseFret: pos.baseFret ?? 1,
    barres: pos.barres ?? [],
    capo: pos.capo,
  };
}

export function chordNoteNames(symbol: string): string[] {
  const c = Chord.get(symbol.trim());
  if (c.empty || !c.notes?.length) return [];
  return c.notes;
}
