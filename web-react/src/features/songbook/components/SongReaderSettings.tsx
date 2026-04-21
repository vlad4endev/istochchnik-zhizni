import { useEffect, useRef, useState } from 'react';
import { LuMinus, LuPlus, LuSettings2 } from 'react-icons/lu';

type SongReaderSettingsProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  currentKeyLabel?: string;
  fontSize: number;
  onFontSize: (v: number) => void;
  transpose: number;
  onTranspose: (next: number) => void;
  showChords: boolean;
  onShowChords: (v: boolean) => void;
  scrollSpeed: number;
  onScrollSpeed: (v: number) => void;
  autoScroll?: boolean;
  onAutoScroll?: (v: boolean) => void;
  capo: number;
  onCapo: (v: number) => void;
  showConcertChords: boolean;
  onShowConcertChords: (v: boolean) => void;
  stageMode: boolean;
};

function btnBase(stage: boolean) {
  return stage
    ? 'min-h-[44px] min-w-[44px] rounded-xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
    : 'min-h-[44px] min-w-[44px] rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50';
}

/** Плавающие настройки: popover рядом с иконкой Settings. */
export function SongReaderSettings({
  open,
  onOpenChange,
  showTrigger = true,
  currentKeyLabel,
  fontSize,
  onFontSize,
  transpose,
  onTranspose,
  showChords,
  onShowChords,
  scrollSpeed,
  onScrollSpeed,
  autoScroll,
  onAutoScroll,
  capo,
  onCapo,
  showConcertChords,
  onShowConcertChords,
  stageMode,
}: SongReaderSettingsProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (!isControlled) setInternalOpen(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const panelClass = stageMode
    ? 'border-stone-200 bg-[var(--surface-elevated)] text-stone-900 shadow-xl'
    : 'border-stone-200 bg-[var(--surface-elevated)] text-stone-900 shadow-xl';

  return (
    <div ref={rootRef} className="relative">
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className={btnBase(stageMode)}
          aria-label="Настройки песни"
        >
          <LuSettings2 className="mx-auto h-5 w-5" />
        </button>
      ) : null}
      {isOpen ? (
        <div
          className={[
            stageMode
              ? 'fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl border p-4'
              : 'absolute right-0 top-[calc(100%+0.5rem)] z-50 flex w-[min(22rem,calc(100vw-1.25rem))] max-h-[70dvh] flex-col overflow-y-auto rounded-2xl border p-4',
            panelClass,
          ].join(' ')}
          role="dialog"
          aria-label="Настройки просмотра"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className={`text-xs font-semibold uppercase tracking-widest ${stageMode ? 'text-stone-500' : 'text-stone-500'}`}>
              Настройки
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={btnBase(stageMode)}
              aria-label="Закрыть настройки"
            >
              <LuSettings2 className="mx-auto h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Тональность</p>
                <div className="flex items-center justify-between gap-2">
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
                <p className={`mt-2 text-[11px] ${stageMode ? 'text-stone-500' : 'text-stone-500'}`}>
                  {currentKeyLabel ?? 'Сдвиг'}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Размер текста</p>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className={btnBase(stageMode)}
                    aria-label="Меньше шрифт"
                    onClick={() => onFontSize(Math.max(fontSize - 1, 14))}
                  >
                    <LuMinus className="mx-auto h-5 w-5" />
                  </button>
                  <span className="min-w-[3rem] text-center text-base font-semibold tabular-nums">{fontSize}</span>
                  <button
                    type="button"
                    className={btnBase(stageMode)}
                    aria-label="Больше шрифт"
                    onClick={() => onFontSize(Math.min(fontSize + 1, 32))}
                  >
                    <LuPlus className="mx-auto h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
              <span className="text-sm">Аккорды</span>
              <input
                type="checkbox"
                className="h-6 w-11 accent-primary"
                checked={showChords}
                onChange={(e) => onShowChords(e.target.checked)}
              />
            </label>

            <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
              <span className="text-sm">Концертные аккорды</span>
              <input
                type="checkbox"
                className="h-6 w-11 accent-primary"
                checked={showConcertChords}
                onChange={(e) => onShowConcertChords(e.target.checked)}
              />
            </label>

            <div className="rounded-xl bg-stone-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Каподастр</p>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className={btnBase(stageMode)}
                  aria-label="Капо меньше"
                  onClick={() => onCapo(Math.max(capo - 1, 0))}
                >
                  <LuMinus className="mx-auto h-5 w-5" />
                </button>
                <span className="min-w-[3rem] text-center text-base font-semibold tabular-nums">{capo}</span>
                <button
                  type="button"
                  className={btnBase(stageMode)}
                  aria-label="Капо больше"
                  onClick={() => onCapo(Math.min(capo + 1, 12))}
                >
                  <LuPlus className="mx-auto h-5 w-5" />
                </button>
              </div>
            </div>

            {onAutoScroll ? (
              <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-sm">Автоскролл</span>
                <input
                  type="checkbox"
                  className="h-6 w-11 accent-primary"
                  checked={Boolean(autoScroll)}
                  onChange={(e) => onAutoScroll(e.target.checked)}
                />
              </label>
            ) : null}

            <div className="rounded-xl bg-stone-50 p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Скорость прокрутки
              </p>
              <input
                type="range"
                min={0}
                max={120}
                step={5}
                value={scrollSpeed}
                onChange={(e) => onScrollSpeed(Number(e.target.value))}
                className="h-11 w-full accent-primary"
              />
              <p className="text-xs tabular-nums opacity-80">{scrollSpeed} px/с</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
