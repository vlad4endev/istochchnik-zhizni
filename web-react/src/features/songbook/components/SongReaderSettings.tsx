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
    ? 'min-h-[44px] min-w-[44px] rounded-xl border border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
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
    ? 'border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl'
    : 'border-stone-200 bg-[var(--surface-elevated)] text-[var(--text)] shadow-xl';

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
            'absolute right-0 top-[calc(100%+0.5rem)] z-50 flex w-[min(22rem,calc(100vw-1.25rem))] max-h-[70dvh] flex-col overflow-y-auto rounded-2xl border p-4',
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
          </div>

        <div className="space-y-4 text-sm">
          <div>
            <p className={`mb-2 text-xs font-bold uppercase ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              Размер текста
            </p>
            <input
              type="range"
              min={14}
              max={32}
              step={1}
              value={fontSize}
              onChange={(e) => onFontSize(Number(e.target.value))}
              className="h-11 w-full accent-primary"
            />
            <p className="text-xs tabular-nums opacity-80">{fontSize}px</p>
          </div>

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
            <p className={`mt-1 text-xs ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              {currentKeyLabel ? `Текущая тональность: ${currentKeyLabel}` : 'Сдвиг в полутонах'}
            </p>
          </div>

          <div>
            <p className={`mb-2 text-xs font-bold uppercase ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              Каподастр
            </p>
            <div className="flex items-center gap-2">
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
            <p className={`mt-1 text-xs ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
              При капо показываются аппликатуры для игры и концертные аккорды.
            </p>
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1">
            <span>Показывать аккорды</span>
            <input
              type="checkbox"
              className="h-6 w-11 accent-primary"
              checked={showChords}
              onChange={(e) => onShowChords(e.target.checked)}
            />
          </label>

          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1">
            <span>Показывать концертные аккорды</span>
            <input
              type="checkbox"
              className="h-6 w-11 accent-primary"
              checked={showConcertChords}
              onChange={(e) => onShowConcertChords(e.target.checked)}
            />
          </label>

          {onAutoScroll ? (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
              <span>Автоскролл</span>
              <input
                type="checkbox"
                className="h-6 w-11 accent-primary"
                checked={Boolean(autoScroll)}
                onChange={(e) => onAutoScroll(e.target.checked)}
              />
            </label>
          ) : null}
          <div>
            <p className={`mb-1 text-xs ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>Скорость скролла</p>
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
