import { useMemo, useState } from 'react';

import { transposeBracketChords } from '../chordUtils';
import { ChordPopover } from './ChordPopover';

type Props = {
  text: string;
  transposeSemitones: number;
  className?: string;
};

export function LyricsWithChords({ text, transposeSemitones, className }: Props) {
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const tText = useMemo(
    () => transposeBracketChords(text, transposeSemitones),
    [text, transposeSemitones],
  );
  const parts = tText.split(/(\[[^\]]+\])/g);

  return (
    <>
      <div className={className}>
        {parts.map((part, i) => {
          const m = part.match(/^\[([^\]]+)\]$/);
          if (!m) {
            return <span key={i}>{part}</span>;
          }
          const sym = m[1];
          return (
            <button
              key={i}
              type="button"
              className="mx-0.5 inline rounded bg-amber-100 px-1 align-baseline font-semibold text-amber-950 hover:bg-amber-200"
              onClick={() => setOpenSymbol(sym)}
            >
              [{sym}]
            </button>
          );
        })}
      </div>
      {openSymbol && (
        <ChordPopover symbol={openSymbol} onClose={() => setOpenSymbol(null)} />
      )}
    </>
  );
}
