import { AiAgentError, chatCompletion } from '../ai';

type ParsedChordLine = {
  text: string;
  chordCount: number;
  chords: Array<{ chord: string; position: number }>;
};

function normalizeNewlines(input: string): string {
  return (typeof input === 'string' ? input : '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitGraphemeClusters(input: string, locale = 'ru'): string[] {
  const source = typeof input === 'string' ? input : '';
  if (source.length === 0) return [];
  try {
    const IntlAny = Intl as typeof Intl & {
      Segmenter?: new (loc: string, opts: { granularity: 'grapheme' }) => {
        segment: (s: string) => Iterable<{ segment: string }>;
      };
    };
    const Segmenter = IntlAny.Segmenter;
    if (typeof Segmenter === 'function') {
      const iter = new Segmenter(locale, { granularity: 'grapheme' }).segment(source);
      return Array.from(iter, (s) => s.segment);
    }
  } catch {
    // fallback below
  }
  return Array.from(source);
}

function parseChordProLine(line: string): ParsedChordLine {
  const source = typeof line === 'string' ? line : '';
  let cursor = 0;
  let chordCount = 0;
  let textPosition = 0;
  const textParts: string[] = [];
  const chords: Array<{ chord: string; position: number }> = [];

  while (cursor < source.length) {
    if (source[cursor] === '[') {
      const close = source.indexOf(']', cursor + 1);
      if (close !== -1) {
        const chord = source.slice(cursor + 1, close).trim();
        if (chord.length > 0) {
          chordCount += 1;
          chords.push({ chord, position: textPosition });
          cursor = close + 1;
          continue;
        }
      }
    }
    const ch = source[cursor] ?? '';
    textParts.push(ch);
    textPosition += splitGraphemeClusters(ch).length;
    cursor += 1;
  }

  return {
    text: textParts.join(''),
    chordCount,
    chords,
  };
}

function stripAssistantWrappers(raw: string): string {
  let s = raw.trim();
  const fenced = /^```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)\n?```\s*$/m.exec(s);
  if (fenced?.[1]) {
    s = fenced[1].trim();
  }
  return s;
}

function validateLyricsIntegrity(original: string, candidate: string): {
  changedLines: number;
  totalChords: number;
} {
  const srcLines = normalizeNewlines(original).split('\n');
  const outLines = normalizeNewlines(candidate).split('\n');
  if (srcLines.length !== outLines.length) {
    throw new Error('ИИ изменил число строк');
  }

  let changedLines = 0;
  let totalChords = 0;
  for (let i = 0; i < srcLines.length; i += 1) {
    const src = parseChordProLine(srcLines[i] ?? '');
    const out = parseChordProLine(outLines[i] ?? '');
    if (src.text !== out.text) {
      throw new Error(`ИИ изменил текст строки ${i + 1}`);
    }
    if ((srcLines[i] ?? '') !== (outLines[i] ?? '')) {
      changedLines += 1;
    }
    totalChords += out.chordCount;
  }
  return { changedLines, totalChords };
}

function normalizeRelativePos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function insertChordsIntoText(text: string, chords: Array<{ chord: string; position: number }>): string {
  const graphemes = splitGraphemeClusters(text);
  const buckets = new Map<number, string[]>();
  chords.forEach((item) => {
    const pos = Math.max(0, Math.min(graphemes.length, Math.round(item.position)));
    const existing = buckets.get(pos) ?? [];
    existing.push(item.chord);
    buckets.set(pos, existing);
  });
  const out: string[] = [];
  for (let i = 0; i <= graphemes.length; i += 1) {
    const atPos = buckets.get(i);
    if (atPos && atPos.length > 0) {
      atPos.forEach((ch) => out.push(`[${ch}]`));
    }
    if (i < graphemes.length) {
      out.push(graphemes[i] ?? '');
    }
  }
  return out.join('');
}

function projectCandidateChordsToOriginal(original: string, candidate: string): string {
  const srcLines = normalizeNewlines(original).split('\n');
  const outLines = normalizeNewlines(candidate).split('\n');
  if (srcLines.length !== outLines.length) {
    throw new Error('ИИ изменил число строк');
  }

  const merged = srcLines.map((srcLine, idx) => {
    const src = parseChordProLine(srcLine);
    const out = parseChordProLine(outLines[idx] ?? '');
    const outTextLen = splitGraphemeClusters(out.text).length;
    const srcTextLen = splitGraphemeClusters(src.text).length;
    const projected = out.chords.map((ch) => ({
      chord: ch.chord,
      position:
        outTextLen > 0
          ? Math.round(normalizeRelativePos(ch.position / outTextLen) * srcTextLen)
          : 0,
    }));
    return insertChordsIntoText(src.text, projected);
  });
  return merged.join('\n');
}

export type StudioAiChordResult = {
  content: string;
  changedLines: number;
  totalChords: number;
};

export async function improveChordPlacementWithAi(content: string): Promise<StudioAiChordResult> {
  const source = normalizeNewlines(content);
  if (!source.trim()) {
    return { content: source, changedLines: 0, totalChords: 0 };
  }

  const response = await chatCompletion(
    [
      {
        role: 'user',
        content: [
          'Расставь и выровняй аккорды в ChordPro-тексте.',
          'КРИТИЧНО: нельзя менять ни один символ текста песни, пробелы, пунктуацию, регистр и количество строк.',
          'Разрешено только добавлять/перемещать/удалять теги аккордов вида [Am] в тех же строках.',
          'Верни только итоговый ChordPro-текст, без пояснений и без markdown.',
          '',
          source,
        ].join('\n'),
      },
    ],
    { section: 'studio', temperature: 0.2, max_tokens: 6000 },
  );

  let candidate = normalizeNewlines(stripAssistantWrappers(response));
  try {
    validateLyricsIntegrity(source, candidate);
  } catch {
    // If model touched lyrics, keep original lyrics and project only chord positions.
    candidate = projectCandidateChordsToOriginal(source, candidate);
  }
  const stats = validateLyricsIntegrity(source, candidate);
  return {
    content: candidate,
    changedLines: stats.changedLines,
    totalChords: stats.totalChords,
  };
}

export { AiAgentError };
