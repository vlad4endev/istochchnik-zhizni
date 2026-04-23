import { Chord, Note } from '@tonaljs/tonal';
import guitarData from '@tombatossals/chords-db/lib/guitar.json';

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const CYRILLIC_NOTES = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си'] as const;
const CYRILLIC_NOTES_FLAT = ['До', 'Реb', 'Ре', 'Миb', 'Ми', 'Фа', 'Сольb', 'Соль', 'Ляb', 'Ля', 'Сиb', 'Си'] as const;

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  H: 11,
  До: 0,
  'До#': 1,
  Реб: 1,
  Ре: 2,
  'Ре#': 3,
  Миб: 3,
  Ми: 4,
  Фа: 5,
  'Фа#': 6,
  Сольб: 6,
  Соль: 7,
  'Соль#': 8,
  Ляб: 8,
  Ля: 9,
  'Ля#': 10,
  Сиб: 10,
  Си: 11,
};

type NoteStyle = 'latin' | 'cyrillic';

type ParsedNote = {
  start: number;
  end: number;
  index: number;
  preferFlats: boolean;
  style: NoteStyle;
};

function normalizeAccidental(acc: string | undefined): '' | '#' | 'b' {
  if (!acc) return '';
  if (acc === '#' || acc === '♯') return '#';
  if (acc === 'b' || acc === '♭') return 'b';
  return '';
}

function normalizeLatinRoot(raw: string): string {
  return raw
    .replace(/А/g, 'A')
    .replace(/а/g, 'a')
    .replace(/В/g, 'B')
    .replace(/в/g, 'b')
    .replace(/С/g, 'C')
    .replace(/с/g, 'c')
    .replace(/Е/g, 'E')
    .replace(/е/g, 'e')
    .replace(/Н/g, 'H')
    .replace(/н/g, 'h');
}

function parseCyrillicNoteAt(input: string, from: number): ParsedNote | null {
  const chunk = input.slice(from);
  const m = chunk.match(/^(До|Ре|Ми|Фа|Соль|Ля|Си)([#b♯♭]?)/i);
  if (!m) return null;

  const baseRaw = m[1] ?? '';
  const accidental = normalizeAccidental(m[2]);
  const base = baseRaw[0]?.toUpperCase() + baseRaw.slice(1).toLowerCase();
  const key = `${base}${accidental}` as keyof typeof NOTE_TO_INDEX;
  const index = NOTE_TO_INDEX[key];
  if (index == null) return null;

  return {
    start: from,
    end: from + m[0].length,
    index,
    preferFlats: accidental === 'b',
    style: 'cyrillic',
  };
}

function parseLatinNoteAt(input: string, from: number): ParsedNote | null {
  const chunk = input.slice(from);
  const m = chunk.match(/^([A-GHАВСЕНавсен])([#b♯♭]?)/);
  if (!m) return null;

  const baseRaw = normalizeLatinRoot(m[1] ?? '').toUpperCase();
  const accidental = normalizeAccidental(m[2]);
  const key = `${baseRaw}${accidental}` as keyof typeof NOTE_TO_INDEX;
  const index = NOTE_TO_INDEX[key];
  if (index == null) return null;

  return {
    start: from,
    end: from + m[0].length,
    index,
    preferFlats: accidental === 'b',
    style: 'latin',
  };
}

function parseNoteAt(input: string, from: number): ParsedNote | null {
  return parseCyrillicNoteAt(input, from) ?? parseLatinNoteAt(input, from);
}

function renderNote(index: number, style: NoteStyle, preferFlats: boolean): string {
  const n = ((index % 12) + 12) % 12;
  if (style === 'cyrillic') {
    return preferFlats ? CYRILLIC_NOTES_FLAT[n] : CYRILLIC_NOTES[n];
  }
  return preferFlats ? FLAT_NOTES[n] : SHARP_NOTES[n];
}

function transposeParsedNote(note: ParsedNote, semitones: number): string {
  return renderNote(note.index + semitones, note.style, note.preferFlats);
}

function transposeWithStructuredParsing(symbol: string, semitones: number): string | null {
  const root = parseNoteAt(symbol, 0);
  if (!root) return null;

  let out = `${transposeParsedNote(root, semitones)}${symbol.slice(root.end)}`;
  const slashPos = out.lastIndexOf('/');
  if (slashPos <= 0 || slashPos >= out.length - 1) return out;

  const bass = parseNoteAt(out, slashPos + 1);
  if (!bass) return out;

  out = `${out.slice(0, bass.start)}${transposeParsedNote(bass, semitones)}${out.slice(bass.end)}`;
  return out;
}

export function transposeChordSymbol(symbol: string, semitones: number): string {
  const s = symbol.trim();
  if (!s || semitones === 0) return s;
  const shift = Math.trunc(semitones);

  const structured = transposeWithStructuredParsing(s, shift);
  if (structured) return structured;

  const dir = shift > 0 ? '2m' : '-2m';
  let out = s;
  const n = Math.abs(shift);
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
