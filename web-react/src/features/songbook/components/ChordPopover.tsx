import ChordDiagram from '@tombatossals/react-chords/lib/Chord';
import { LuX } from 'react-icons/lu';

import guitarData from '@tombatossals/chords-db/lib/guitar.json';

import { chordNoteNames, lookupGuitarPosition } from '../chordUtils';
import { PianoMini } from './PianoMini';

const instrument = {
  strings: guitarData.main.strings,
  fretsOnChord: guitarData.main.fretsOnChord,
  name: guitarData.main.name,
  tunings: guitarData.tunings,
};

type Props = {
  symbol: string;
  onClose: () => void;
};

export function ChordPopover({ symbol, onClose }: Props) {
  const guitar = lookupGuitarPosition(symbol);
  const notes = chordNoteNames(symbol);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-label={`Аккорд ${symbol}`}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-[var(--surface)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-stone-900">{symbol}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-stone-500">Гитара</p>
            {guitar ? (
              <div className="mx-auto max-w-[200px]">
                <ChordDiagram chord={guitar} instrument={instrument} lite />
              </div>
            ) : (
              <p className="text-sm text-stone-600">
                Аппликатура для этого обозначения не найдена в базе — см. ноты ниже.
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase text-stone-500">Фортепиано</p>
            <PianoMini noteNames={notes} />
          </div>
        </div>
      </div>
    </div>
  );
}
