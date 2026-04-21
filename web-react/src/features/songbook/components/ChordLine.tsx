import type { ChordTextSegment } from '../utils/chordSegments';
import { splitGraphemeClusters } from '../utils/graphemeClusters';

type ChordLineProps = {
  segments: ChordTextSegment[];
  /** Если false — только текст сегментов, без слоя аккордов. */
  chordsVisible: boolean;
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
 * Одна строка ChordPro: аккорд в абсолютном слое над первой графемой текста;
 * длинный аккорд может наезжать вправо, не раздвигая весь фрагмент лирики.
 */
export function ChordLine({
  segments,
  chordsVisible,
  className = '',
  chordTone = 'light',
}: ChordLineProps) {
  const tone = chordToneClass[chordTone];

  if (!chordsVisible) {
    const plain = segments.map((s) => s.text).join('');
    return (
      <span className={['block w-full min-h-[2.2em]', className].filter(Boolean).join(' ')}>
        {plain || '\u00a0'}
      </span>
    );
  }

  const hasAnyChord = segments.some((s) => s.chord.trim().length > 0);
  if (!hasAnyChord) {
    const plain = segments.map((s) => s.text).join('');
    return (
      <span className={['block w-full min-h-[2.2em] whitespace-pre-wrap', className].filter(Boolean).join(' ')}>
        {plain || '\u00a0'}
      </span>
    );
  }

  const chordLayerClass = [
    'pointer-events-none absolute left-0 top-0 z-[1] min-w-max whitespace-nowrap font-mono text-[0.78em] font-bold leading-none tracking-tight',
    tone,
  ].join(' ');

  const lyricPadClass = 'inline-block whitespace-pre pt-[1.25em]';

  return (
    <div className={['w-full min-h-[2.2em] overflow-x-auto', className].filter(Boolean).join(' ')}>
      <div className="inline-block min-w-full whitespace-pre">
        {segments.map((seg, idx) => {
          const chordRaw = seg.chord;
          const hasChord = chordRaw.trim().length > 0;

          if (hasChord && seg.text.length > 0) {
            const clusters = splitGraphemeClusters(seg.text);
            const first = clusters[0] ?? '';
            const rest = clusters.slice(1).join('');

            return (
              <span
                key={idx}
                className="inline-flex min-h-[2.2em] flex-row items-end align-top"
                data-chunk-at={seg.charIndex}
              >
                <span className="relative inline-block shrink-0 pt-[1.25em]">
                  <span className={chordLayerClass} aria-hidden>
                    {chordRaw}
                  </span>
                  {first}
                </span>
                {rest ? <span className={lyricPadClass}>{rest}</span> : null}
              </span>
            );
          }

          return (
            <span
              key={idx}
              className="relative inline-flex min-h-[2.2em] flex-col justify-end align-top"
              data-chunk-at={seg.charIndex}
            >
              {hasChord ? (
                <span className={chordLayerClass} aria-hidden>
                  {chordRaw}
                </span>
              ) : null}
              <span
                className={lyricPadClass}
                style={seg.text.length === 0 && hasChord ? { minWidth: '0.35ch' } : undefined}
              >
                {seg.text.length === 0 && hasChord ? '\u200b' : seg.text}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
