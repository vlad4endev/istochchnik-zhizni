import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ParsedChordLine } from './chordParser';
import { ChordsRow } from './ChordsRow';

type SongLineProps = {
  line: ParsedChordLine;
  chordsVisible: boolean;
  chordTone: 'light' | 'dark';
  layoutMode: 'mono' | 'measured';
  className?: string;
};

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

export function SongLine({ line, chordsVisible, chordTone, layoutMode, className = '' }: SongLineProps) {
  const lyricRef = useRef<HTMLDivElement>(null);
  const [offsetsPx, setOffsetsPx] = useState<number[] | null>(null);
  const text = line.text || '\u00a0';
  const graphemes = useMemo(() => splitGraphemeClusters(text), [text]);

  useLayoutEffect(() => {
    if (layoutMode !== 'measured') {
      setOffsetsPx(null);
      return;
    }
    const el = lyricRef.current;
    if (!el) return;
    const updateOffsets = () => {
      const style = window.getComputedStyle(el);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setOffsetsPx(null);
        return;
      }
      ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const next: number[] = [0];
      let sum = 0;
      for (const g of graphemes) {
        sum += ctx.measureText(g).width;
        next.push(sum);
      }
      setOffsetsPx(next);
    };
    updateOffsets();
    const ro = new ResizeObserver(() => updateOffsets());
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutMode, graphemes]);

  const rowChords = useMemo(
    () =>
      line.chords.map((item, idx) => {
        if (layoutMode === 'measured' && offsetsPx != null) {
          const clamped = Math.max(0, Math.min(item.position, offsetsPx.length - 1));
          return {
            key: `${item.position}-${item.chord}-${idx}`,
            label: item.chord,
            left: `${offsetsPx[clamped]}px`,
          };
        }
        return {
          key: `${item.position}-${item.chord}-${idx}`,
          label: item.chord,
          left: `${item.position}ch`,
        };
      }),
    [line.chords, layoutMode, offsetsPx],
  );

  return (
    <div className={['w-full min-w-0', className].filter(Boolean).join(' ')}>
      <div
        className={[
          'block w-full whitespace-pre-wrap break-words leading-[1.45]',
          layoutMode === 'mono' ? 'font-["JetBrains_Mono","Courier_New",monospace]' : 'font-sans',
        ].join(' ')}
      >
        <ChordsRow chords={rowChords} visible={chordsVisible} tone={chordTone} />
        <div ref={lyricRef} className="whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    </div>
  );
}
