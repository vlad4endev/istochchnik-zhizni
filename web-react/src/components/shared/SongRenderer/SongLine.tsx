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

export function SongLine({ line, chordsVisible, chordTone, layoutMode, className = '' }: SongLineProps) {
  const text = typeof line.text === 'string' ? line.text : '';
  const graphemes = splitGraphemeClusters(text);
  const normalizedChords = resolveOverlaps(line.chords ?? []);
  const chordToneClass = chordTone === 'dark' ? 'text-emerald-300' : 'text-[#2563EB]';
  const rootClassName = ['line-pair w-full min-w-0', className].filter(Boolean).join(' ');

  const hasText = graphemes.length > 0;
  const hasChords = normalizedChords.length > 0;

  if (!hasText && !hasChords) {
    return <div className="song-line-gap h-4 w-full" data-layout-mode={layoutMode} />;
  }

  if (!chordsVisible) {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode} data-chord-tone={chordTone}>
        <p className="lyric-line m-0 overflow-visible p-0 whitespace-pre-wrap break-words">{text}</p>
      </div>
    );
  }

  if (!hasText && hasChords) {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode} data-chord-tone={chordTone}>
        <div className={`chord-line-only m-0 flex flex-wrap gap-x-3 gap-y-1 p-0 ${chordToneClass}`}>
          {normalizedChords.map((chord, index) => (
            <span key={`${chord.position}-${index}`} className="chord-token whitespace-nowrap font-semibold">
              {chord.chord}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const chordLine = buildChordLine(text, normalizedChords);

  if (layoutMode === 'mono') {
    return (
      <div className={rootClassName} data-layout-mode={layoutMode} data-chord-tone={chordTone}>
        {chordLine.trim() !== '' && (
          <pre
            className={['chord-line m-0 max-w-full overflow-x-auto overflow-y-visible p-0 whitespace-pre', chordToneClass].join(' ')}
          >
            {chordLine}
          </pre>
        )}
        <pre className="lyric-line lyric-line--mono m-0 max-w-full overflow-x-auto overflow-y-visible p-0 whitespace-pre-wrap break-words">
          {text}
        </pre>
      </div>
    );
  }

  return (
    <div className={rootClassName} data-layout-mode={layoutMode} data-chord-tone={chordTone}>
      {chordLine.trim() !== '' && (
        <pre
          className={['chord-line m-0 max-w-full overflow-x-auto overflow-y-visible p-0 whitespace-pre', chordToneClass].join(' ')}
        >
          {chordLine}
        </pre>
      )}
      <p className="lyric-line m-0 overflow-visible p-0 whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}
