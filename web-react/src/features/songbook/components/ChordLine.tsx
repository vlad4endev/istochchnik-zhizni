import type { ChordTextSegment } from '../utils/chordSegments';

/** Резервируем ширину под `font-mono text-sm` аккорд (left-0), чтобы не наезжал на соседний сегмент. */
function segmentMinWidthEm(chord: string, text: string): number | undefined {
  const c = chord.trim();
  if (!c) return undefined;
  const textLen = [...text.replace(/\u00a0/g, '')].length;
  const chordLen = c.length;
  const forChord = chordLen * 0.82 + 0.65;
  const forText = textLen > 0 ? Math.max(textLen * 0.58, 0.45) : 1.0;
  return Math.max(forChord, forText, 1.35);
}

type ChordLineProps = {
  segments: ChordTextSegment[];
  /** Если false — только текст сегментов, без слоя аккордов. */
  chordsVisible: boolean;
  /** Клик по аккорду (диаграмма и т.д.). */
  onChordClick?: (symbol: string) => void;
  /** Доп. класс для строки-обёртки. */
  className?: string;
  /** Тон аккордов: на тёмном фоне — `dark`, на светлом — `light`. */
  chordTone?: 'light' | 'dark';
};

const chordToneClass = {
  light: 'text-sky-700',
  dark: 'text-amber-400',
} as const;

/**
 * Одна строка текста с аккордами над слогами (inline-block + absolute chord layer).
 */
export function ChordLine({
  segments,
  chordsVisible,
  onChordClick,
  className = '',
  chordTone = 'light',
}: ChordLineProps) {
  const tone = chordToneClass[chordTone];

  if (!chordsVisible) {
    const plain = segments.map((s) => s.text).join('');
    return (
      <span className={['block w-full', className].filter(Boolean).join(' ')}>
        {plain || '\u00a0'}
      </span>
    );
  }

  const hasAnyChord = segments.some((s) => s.chord.trim().length > 0);

  return (
    <div
      className={[
        'w-full',
        hasAnyChord ? 'overflow-x-auto pt-[1.35rem]' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Строка — flex: сегменты в ряд, перенос по ширине; аккорд — слой над текстом сегмента */}
      <div className="flex min-w-min flex-wrap items-end gap-x-1.5 [row-gap:0.125rem]">
        {segments.map((seg, idx) => (
          <span
            key={idx}
            className="relative inline-block max-w-full shrink-0 align-bottom"
            style={seg.chord ? { minWidth: `${segmentMinWidthEm(seg.chord, seg.text)}em` } : undefined}
          >
            {seg.chord ? (
              onChordClick ? (
                <button
                  type="button"
                  className={[
                    'absolute left-0 top-[-1.5rem] z-[1] whitespace-nowrap font-mono text-sm font-bold leading-none tracking-tight',
                    tone,
                    'rounded px-0.5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50',
                  ].join(' ')}
                  onClick={() => onChordClick(seg.chord)}
                >
                  {seg.chord}
                </button>
              ) : (
                <span
                  className={[
                    'pointer-events-none absolute left-0 top-[-1.5rem] z-[1] whitespace-nowrap font-mono text-sm font-bold leading-none tracking-tight',
                    tone,
                  ].join(' ')}
                >
                  {seg.chord}
                </span>
              )
            ) : null}
            <span className="inline-block whitespace-pre-wrap">
              {seg.text.length === 0 && seg.chord ? '\u00a0' : seg.text}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
