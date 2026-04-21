import type { ChordTextSegment } from '../utils/chordSegments';

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
  if (!hasAnyChord) {
    const plain = segments.map((s) => s.text).join('');
    return (
      <span className={['block w-full whitespace-pre-wrap', className].filter(Boolean).join(' ')}>
        {plain || '\u00a0'}
      </span>
    );
  }

  return (
    <div className={['w-full overflow-x-auto', className].filter(Boolean).join(' ')}>
      <div className="inline-block min-w-full whitespace-pre">
        {segments.map((seg, idx) => (
          <span key={idx} className="inline-grid align-top [grid-template-rows:1.2rem_auto]">
            {seg.chord ? (
              onChordClick ? (
                <button
                  type="button"
                  className={[
                    'row-start-1 text-left whitespace-nowrap font-mono text-sm font-bold leading-none tracking-tight',
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
                    'pointer-events-none row-start-1 whitespace-nowrap font-mono text-sm font-bold leading-none tracking-tight',
                    tone,
                  ].join(' ')}
                >
                  {seg.chord}
                </span>
              )
            ) : (
              <span className="row-start-1" aria-hidden />
            )}
            <span className="row-start-2 inline-block whitespace-pre">
              {seg.text.length === 0 && seg.chord ? '\u200b' : seg.text}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
