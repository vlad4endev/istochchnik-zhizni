import type { ChordAnchor, ParsedChordLine } from './chordParser';
import { splitGraphemeClusters } from './chordParser';

type SongLineProps = {
  line: ParsedChordLine;
  chordsVisible: boolean;
  chordTone: 'light' | 'dark';
  layoutMode: 'mono' | 'measured';
  className?: string;
};

export function resolveOverlaps(chords: ChordAnchor[]): ChordAnchor[] {
  const sorted = [...chords].sort((a, b) => a.position - b.position);
  const result: ChordAnchor[] = [];
  let lastEnd = -1;

  for (const chord of sorted) {
    const start = Math.max(chord.position, lastEnd + 1);
    result.push({ ...chord, position: start });
    lastEnd = start + chord.chord.length;
  }

  return result;
}

export function buildChordLine(text: string, chords: ChordAnchor[]): string {
  const graphemes = splitGraphemeClusters(text);
  const normalized = resolveOverlaps(chords);
  if (graphemes.length === 0) {
    return buildFromAnchors(normalized);
  }

  const cells: string[] = graphemes.map(() => ' ');
  for (const chord of normalized) {
    const start = Math.max(0, Math.min(chord.position, cells.length));
    for (let i = 0; i < chord.chord.length; i += 1) {
      const idx = start + i;
      if (idx >= cells.length) cells.push(chord.chord[i] ?? ' ');
      else cells[idx] = chord.chord[i] ?? ' ';
    }
  }

  return cells.join('').trimEnd();
}

function buildFromAnchors(chords: ChordAnchor[]): string {
  if (chords.length === 0) return '';
  const cells: string[] = [];
  for (const chord of chords) {
    const start = Math.max(0, chord.position);
    while (cells.length < start) cells.push(' ');
    for (let i = 0; i < chord.chord.length; i += 1) {
      const idx = start + i;
      if (idx >= cells.length) cells.push(chord.chord[i] ?? ' ');
      else cells[idx] = chord.chord[i] ?? ' ';
    }
  }
  return cells.join('').trimEnd();
}

function groupChordsByPosition(chords: ChordAnchor[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const chord of chords) {
    const list = map.get(chord.position) ?? [];
    list.push(chord.chord);
    map.set(chord.position, list);
  }
  return map;
}

export function SongLine({ line, chordsVisible, chordTone, layoutMode, className = '' }: SongLineProps) {
  const text = typeof line.text === 'string' ? line.text : '';
  const graphemes = splitGraphemeClusters(text);
  const normalizedChords = resolveOverlaps(line.chords ?? []);
  const chordToneClass = chordTone === 'dark' ? 'text-amber-300' : 'text-[#2563EB]';
  const rootClassName = ['line-pair w-full min-w-0', className].filter(Boolean).join(' ');

  const hasText = graphemes.length > 0;
  const hasChords = normalizedChords.length > 0;

  if (!hasText && !hasChords) {
    return <div className="song-line-gap h-4 w-full" data-layout-mode={layoutMode} />;
  }

  if (!chordsVisible) {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode}>
        <p className="lyric-line m-0 overflow-visible p-0 whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  if (!hasText && hasChords) {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode}>
        <div className={`chord-line-only m-0 flex flex-wrap gap-x-4 gap-y-1 p-0 ${chordToneClass}`}>
          {normalizedChords.map((chord, index) => (
            <span key={`${chord.position}-${index}`} className="chord-token whitespace-nowrap font-semibold">
              {chord.chord}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (layoutMode === 'mono') {
    const chordLine = buildChordLine(text, normalizedChords);
    return (
      <div className={rootClassName} data-layout-mode={layoutMode}>
        {chordLine.trim() !== '' && (
          <pre
            className={['chord-line m-0 overflow-visible p-0 whitespace-pre', chordToneClass].join(' ')}
          >
            {chordLine}
          </pre>
        )}
        <pre className="lyric-line lyric-line--mono m-0 overflow-visible p-0 whitespace-pre-wrap">{text}</pre>
      </div>
    );
  }

  const anchorChords = line.chords ?? [];
  const chordsByPosition = groupChordsByPosition(anchorChords);

  if (anchorChords.length === 0) {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode}>
        <p className="lyric-line m-0 overflow-visible p-0 whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  return (
    <div className={rootClassName} data-layout-mode={layoutMode}>
      <div className="lyric-chord-line lyric-chord-line--with-chords">
        {graphemes.map((grapheme, index) => {
          const labels = chordsByPosition.get(index) ?? [];
          const hasLabel = labels.length > 0;
          return (
            <span
              key={index}
              className="lyric-chord-column relative inline-block align-bottom leading-none"
            >
              {hasLabel ? (
                <span
                  className={[
                    'chord-slot pointer-events-none absolute bottom-full left-0 mb-[2px] whitespace-nowrap font-semibold leading-none',
                    chordToneClass,
                  ].join(' ')}
                >
                  {labels.join(' ')}
                </span>
              ) : null}
              <span className="lyric-grapheme whitespace-pre">{grapheme === ' ' ? '\u00a0' : grapheme}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
