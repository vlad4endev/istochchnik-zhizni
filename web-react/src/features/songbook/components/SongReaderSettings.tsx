import { LuMinus, LuPlus, LuSettings2, LuX } from 'react-icons/lu';

type SongReaderSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transpose: number;
  onTranspose: (next: number) => void;
  showChords: boolean;
  onShowChords: (v: boolean) => void;
  autoScroll: boolean;
  onAutoScroll: (v: boolean) => void;
  scrollSpeed: number;
  onScrollSpeed: (v: number) => void;
  stageMode: boolean;
};

function btnBase(stage: boolean) {
  return stage
    ? 'min-h-[44px] min-w-[44px] rounded-xl border border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
    : 'min-h-[44px] min-w-[44px] rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50';
}

/** Настройки просмотра: мобилка — bottom sheet, веб — панель справа сверху (popover-паттерн). */
export function SongReaderSettings({
  open,
  onOpenChange,
  transpose,
  onTranspose,
  showChords,
  onShowChords,
  autoScroll,
  onAutoScroll,
  scrollSpeed,
  onScrollSpeed,
  stageMode,
}: SongReaderSettingsProps) {
  if (!open) return null;

  const panelClass = stageMode
    ? 'border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl'
    : 'border-stone-200 bg-[var(--surface-elevated)] text-[var(--text)] shadow-xl';

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[55] bg-black/40 md:hidden"
        aria-label="Закрыть настройки"
        onClick={() => onOpenChange(false)}
      />

      <div
        className={[
          'fixed z-[60] flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-2xl border p-4 md:max-h-none md:w-[min(22rem,calc(100vw-2rem))]',
          'inset-x-0 bottom-0 md:inset-auto md:right-4 md:top-[4.5rem] md:rounded-2xl',
          panelClass,
        ].join(' ')}
        role="dialog"
        aria-label="Настройки просмотра"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <LuSettings2 className="h-5 w-5" aria-hidden />
            Просмотр
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={btnBase(stageMode)}
            aria-label="Закрыть"
          >
            <LuX className="mx-auto h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <p className={`mb-2 text-xs font-bold uppercase ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              Транспозиция
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnBase(stageMode)}
                aria-label="Ниже"
                onClick={() => onTranspose(Math.max(transpose - 1, -11))}
              >
                <LuMinus className="mx-auto h-5 w-5" />
              </button>
              <span className="min-w-[3rem] text-center text-base font-semibold tabular-nums">
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                type="button"
                className={btnBase(stageMode)}
                aria-label="Выше"
                onClick={() => onTranspose(Math.min(transpose + 1, 11))}
              >
                <LuPlus className="mx-auto h-5 w-5" />
              </button>
            </div>
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1">
            <span>Только текст</span>
            <input
              type="checkbox"
              className="h-6 w-11 accent-primary"
              checked={!showChords}
              onChange={(e) => onShowChords(!e.target.checked)}
            />
          </label>

          <div>
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
              <span>Автоскролл</span>
              <input
                type="checkbox"
                className="h-6 w-11 accent-primary"
                checked={autoScroll}
                onChange={(e) => onAutoScroll(e.target.checked)}
              />
            </label>
            {autoScroll ? (
              <div className="mt-2">
                <p className={`mb-1 text-xs ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>Скорость</p>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={scrollSpeed}
                  onChange={(e) => onScrollSpeed(Number(e.target.value))}
                  className="h-11 w-full accent-primary"
                />
                <p className="text-xs tabular-nums opacity-80">{scrollSpeed} px/с</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
