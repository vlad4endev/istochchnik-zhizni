const PRESETS = [
  'Интро',
  'Куплет',
  'Припев',
  'Бридж',
  'Предприпев',
  'Соло',
  'Аутро',
  'Куплет 1',
  'Инструментал',
] as const;

type Props = {
  /** Вставка строки `{sec:…}` в текст (песенник / добавление песни) */
  onInsert?: (markerLine: string) => void;
  /** Студия: пресеты добавляют структурный блок композитора */
  onPresetAsBlock?: (title: string) => void;
  /** Тёмная зона (студия / шаг песни в studio) */
  dark?: boolean;
  className?: string;
};

/**
 * Кнопки вставки строки `{sec:…}` — блоки при ручном наборе текста.
 */
export function SectionInsertToolbar({
  onInsert,
  onPresetAsBlock,
  dark = false,
  className = '',
}: Props) {
  const chip = dark
    ? 'border-zinc-600 bg-zinc-800/90 text-zinc-100 hover:bg-zinc-700'
    : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100';

  const pick = (title: string) => {
    if (onPresetAsBlock) {
      onPresetAsBlock(title);
      return;
    }
    onInsert?.(`# ${title.trim()}`);
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
        {onPresetAsBlock
          ? 'Добавляется отдельный блок в композиторе; при сохранении в файл попадёт заголовок секции.'
          : 'В текст добавится строка вида # Куплет 1 — в превью и просмотре это будет заголовок блока.'}
      </p>
    </div>
  );
}
