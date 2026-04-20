import { buildSectionMarker } from '../utils/sectionMarkers';

const PRESETS = [
  'Вступление',
  'Куплет 1',
  'Куплет 2',
  'Куплет 3',
  'Припев',
  'Предприпев',
  'Мост',
  'Бридж',
  'Инструментал',
  'Проигрыш',
  'Финал',
] as const;

type Props = {
  onInsert: (markerLine: string) => void;
  /** Тёмная зона (студия / шаг песни в studio) */
  dark?: boolean;
  className?: string;
};

/**
 * Кнопки вставки строки `{sec:…}` — блоки при ручном наборе текста.
 */
export function SectionInsertToolbar({ onInsert, dark = false, className = '' }: Props) {
  const chip = dark
    ? 'border-zinc-600 bg-zinc-800/90 text-zinc-100 hover:bg-zinc-700'
    : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100';

  const pick = (title: string) => {
    onInsert(buildSectionMarker(title));
  };

  const custom = () => {
    const raw = window.prompt('Название блока (куплет, припев…)', '');
    if (raw == null) return;
    const t = raw.trim();
    if (!t) return;
    pick(t);
  };

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-zinc-400' : 'text-stone-500'}`}>
        Блок песни
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => pick(label)}
            className={['rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors', chip].join(' ')}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={custom}
          className={[
            'rounded-lg border border-dashed px-2.5 py-1.5 text-xs font-medium transition-colors',
            dark
              ? 'border-zinc-500 text-zinc-300 hover:bg-zinc-800'
              : 'border-stone-300 text-stone-600 hover:bg-stone-50',
          ].join(' ')}
        >
          Свой…
        </button>
      </div>
      <p className={`text-[11px] leading-snug ${dark ? 'text-zinc-500' : 'text-stone-500'}`}>
        В текст добавится строка <code className={dark ? 'text-zinc-300' : 'text-stone-700'}>{'{sec:…}'}</code> — в
        превью и при просмотре это отображается как заголовок блока.
      </p>
    </div>
  );
}
