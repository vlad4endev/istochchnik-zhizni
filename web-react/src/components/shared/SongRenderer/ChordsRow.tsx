type RowChord = {
  key: string;
  label: string;
  left: string;
};

type ChordsRowProps = {
  chords: RowChord[];
  visible: boolean;
  tone: 'light' | 'dark';
};

const toneClass = {
  light: 'text-sky-700',
  dark: 'text-amber-300',
} as const;

export function ChordsRow({ chords, visible, tone }: ChordsRowProps) {
  return (
    <div className={['relative h-[1.35em]', !visible ? 'invisible' : ''].join(' ')}>
      {chords.map((chord) => (
        <span
          key={chord.key}
          className={['pointer-events-none absolute top-0 z-[1] whitespace-nowrap text-[0.82em] font-bold leading-none', toneClass[tone]].join(
            ' ',
          )}
          style={{ left: chord.left }}
          aria-hidden
        >
          {chord.label}
        </span>
      ))}
    </div>
  );
}
