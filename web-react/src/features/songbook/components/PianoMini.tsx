import { Note } from '@tonaljs/tonal';

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function chromaSet(names: string[]): Set<number> {
  const s = new Set<number>();
  for (const n of names) {
    const name = /\d/.test(n) ? n : `${n}4`;
    const midi = Note.midi(name);
    if (midi == null) continue;
    s.add(((midi % 12) + 12) % 12);
  }
  return s;
}

/** Компактная «клавиатура»: классы высоты в октаве. */
export function PianoMini({ noteNames }: { noteNames: string[] }) {
  const active = chromaSet(noteNames);

  return (
    <div className="mx-auto w-full max-w-md space-y-2">
      <div className="flex justify-between gap-0.5 rounded-lg border border-stone-200 bg-stone-100 p-2">
        {PCS.map((pc, i) => (
          <div
            key={pc}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-end rounded px-0.5 pb-1 text-[9px] font-semibold ${
              active.has(i) ? 'bg-sky-500 text-white shadow' : 'bg-white text-stone-500'
            }`}
          >
            {pc.replace('#', '♯')}
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-stone-500">
        Ноты: {noteNames.length ? noteNames.join(' · ') : '—'}
      </p>
    </div>
  );
}
