import { LuCheck, LuMinus, LuPlus } from 'react-icons/lu';

import {
  BIBLE_READER_FONT_SCALES,
  type BibleReaderFont,
  type BibleReaderSettings,
  type BibleReaderSpacing,
} from '../bibleUiMeta';
import { BibleSheetShell } from './BibleSheetShell';

type Props = {
  open: boolean;
  value: BibleReaderSettings;
  onChange: (next: BibleReaderSettings) => void;
  onClose: () => void;
};

const FONT_OPTIONS: Array<{ value: BibleReaderFont; label: string; sample: string }> = [
  { value: 'serif', label: 'С засечками', sample: 'font-serif' },
  { value: 'sans', label: 'Без засечек', sample: 'font-sans' },
];

const SPACING_OPTIONS: Array<{ value: BibleReaderSpacing; label: string }> = [
  { value: 'compact', label: 'Плотный' },
  { value: 'normal', label: 'Обычный' },
  { value: 'relaxed', label: 'Свободный' },
];

export function ReaderSettingsSheet({ open, value, onChange, onClose }: Props) {
  const scaleIndex = Math.max(0, BIBLE_READER_FONT_SCALES.indexOf(value.fontScale as never));

  function setScaleIndex(i: number) {
    const clamped = Math.min(BIBLE_READER_FONT_SCALES.length - 1, Math.max(0, i));
    onChange({ ...value, fontScale: BIBLE_READER_FONT_SCALES[clamped] });
  }

  return (
    <BibleSheetShell open={open} title="Чтение" onClose={onClose}>
      <div className="space-y-6 p-4">
        <section>
          <p className="mb-3 text-sm font-bold text-stone-900">Размер текста</p>
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-[var(--surface-elevated)] px-4 py-3">
            <button
              type="button"
              aria-label="Уменьшить текст"
              disabled={scaleIndex === 0}
              onClick={() => setScaleIndex(scaleIndex - 1)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-40"
            >
              <LuMinus size={16} />
            </button>
            <div className="flex-1 text-center">
              <span
                className="font-serif font-bold text-stone-900"
                style={{ fontSize: `${1.0625 * value.fontScale}rem` }}
              >
                Аа
              </span>
            </div>
            <button
              type="button"
              aria-label="Увеличить текст"
              disabled={scaleIndex === BIBLE_READER_FONT_SCALES.length - 1}
              onClick={() => setScaleIndex(scaleIndex + 1)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-40"
            >
              <LuPlus size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            Складывается с общим масштабом шрифта из настроек доступности приложения.
          </p>
        </section>

        <section>
          <p className="mb-3 text-sm font-bold text-stone-900">Шрифт</p>
          <div className="grid grid-cols-2 gap-2">
            {FONT_OPTIONS.map((opt) => {
              const active = value.font === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, font: opt.value })}
                  className={[
                    'flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                    active
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-stone-200 bg-[var(--surface-elevated)]',
                  ].join(' ')}
                >
                  <span className={['text-sm font-semibold text-stone-900', opt.sample].join(' ')}>
                    {opt.label}
                  </span>
                  {active ? <LuCheck size={16} className="text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="mb-3 text-sm font-bold text-stone-900">Межстрочный интервал</p>
          <div className="grid grid-cols-3 gap-2">
            {SPACING_OPTIONS.map((opt) => {
              const active = value.spacing === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, spacing: opt.value })}
                  className={[
                    'rounded-2xl border px-3 py-2.5 text-center text-sm font-semibold transition',
                    active
                      ? 'border-primary/40 bg-primary/10 text-stone-900'
                      : 'border-stone-200 bg-[var(--surface-elevated)] text-stone-600',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </BibleSheetShell>
  );
}
