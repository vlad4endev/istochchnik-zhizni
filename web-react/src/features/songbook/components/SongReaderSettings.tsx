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
  /** Backward-compatible API (old callers). */
  scrollSpeed?: number;
  onScrollSpeed?: (v: number) => void;
  scrollSpeedLevel?: number;
  onScrollSpeedLevel?: (v: number) => void;
  autoScroll?: boolean;
  onAutoScroll?: (v: boolean) => void;
  onAutoScrollStart?: () => void;
  onAutoScrollStop?: () => void;
  onResetTranspose?: () => void;
  fullscreen?: boolean;
  onFullscreen?: (v: boolean) => void;
  capo: number;
  onCapo: (v: number) => void;
  showConcertChords: boolean;
  onShowConcertChords: (v: boolean) => void;
  chordLayoutMode?: 'mono' | 'measured';
  onChordLayoutMode?: (mode: 'mono' | 'measured') => void;
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
  scrollSpeedLevel,
  onScrollSpeedLevel,
  autoScroll,
  onAutoScroll,
  onAutoScrollStart,
  onAutoScrollStop,
  onResetTranspose,
  fullscreen = false,
  onFullscreen,
  capo,
  onCapo,
  showConcertChords,
  onShowConcertChords,
  chordLayoutMode = 'mono',
  onChordLayoutMode,
  stageMode,
}: SongReaderSettingsProps) {
  const resolvedScrollSpeedLevel: number =
    typeof scrollSpeedLevel === 'number' && Number.isFinite(scrollSpeedLevel)
      ? scrollSpeedLevel
      : typeof scrollSpeed === 'number' && Number.isFinite(scrollSpeed)
        ? Math.max(1, Math.min(10, Math.round((scrollSpeed - 20) / 20) + 1))
        : 3;
  const setResolvedScrollSpeedLevel = (nextLevel: number) => {
    onScrollSpeedLevel?.(nextLevel);
    onScrollSpeed?.(20 + (nextLevel - 1) * 20);
  };

  const [internalOpen, setInternalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
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
    ? 'border-stone-200 bg-[var(--surface-elevated)]/90 text-stone-900 shadow-xl backdrop-blur'
    : 'border-stone-200 bg-[var(--surface-elevated)]/90 text-stone-900 shadow-xl backdrop-blur';

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
            'fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl border p-4 md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+0.5rem)] md:w-[min(24rem,calc(100vw-1.25rem))] md:max-h-[72dvh] md:rounded-2xl',
            panelClass,
          ].join(' ')}
          role="dialog"
          aria-label="Настройки просмотра"
          onTouchStart={(e) => {
            dragStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = dragStartYRef.current;
            dragStartYRef.current = null;
            const endY = e.changedTouches[0]?.clientY ?? null;
            if (startY == null || endY == null) return;
            if (endY - startY > 70) setOpen(false);
          }}
        >
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-stone-300 lg:hidden" aria-hidden />
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
            <section className="rounded-xl bg-stone-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Аккорды</p>
              <label className="mb-3 flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 py-2">
                <span className="text-sm">Показать аккорды</span>
                <input
                  type="checkbox"
                  className="h-6 w-11 accent-primary"
                  checked={showChords}
                  onChange={(e) => onShowChords(e.target.checked)}
                />
              </label>
              <div className="rounded-xl bg-white p-3">
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
                {onResetTranspose ? (
                  <button
                    type="button"
                    onClick={onResetTranspose}
                    className="mt-2 inline-flex min-h-[36px] items-center rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Сбросить тональность
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl bg-stone-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Отображение</p>
              <div className="rounded-xl bg-white p-3">
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
              <label className="mt-3 flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 py-2">
                <span className="text-sm">Концертные аккорды</span>
                <input
                  type="checkbox"
                  className="h-6 w-11 accent-primary"
                  checked={showConcertChords}
                  onChange={(e) => onShowConcertChords(e.target.checked)}
                />
              </label>
              {onFullscreen ? (
                <label className="mt-3 flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 py-2">
                  <span className="text-sm">Полноэкранный режим</span>
                  <input
                    type="checkbox"
                    className="h-6 w-11 accent-primary"
                    checked={fullscreen}
                    onChange={(e) => onFullscreen(e.target.checked)}
                  />
                </label>
              ) : null}
            </section>

            {onChordLayoutMode ? (
              <section className="rounded-xl bg-stone-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  Позиционирование аккордов
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={[
                      'rounded-lg border px-2 py-2 text-sm font-medium',
                      chordLayoutMode === 'mono'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                    ].join(' ')}
                    onClick={() => onChordLayoutMode('mono')}
                  >
                    Моно
                  </button>
                  <button
                    type="button"
                    className={[
                      'rounded-lg border px-2 py-2 text-sm font-medium',
                      chordLayoutMode === 'measured'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                    ].join(' ')}
                    onClick={() => onChordLayoutMode('measured')}
                  >
                    Точный
                  </button>
                </div>
              </section>
            ) : null}

            <section className="rounded-xl bg-stone-50 p-3">
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
            </section>

            <section className="rounded-xl bg-stone-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Прокрутка</p>
              {onAutoScroll ? (
                <label className="mb-3 flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 py-2">
                  <span className="text-sm">Автопрокрутка</span>
                  <input
                    type="checkbox"
                    className="h-6 w-11 accent-primary"
                    checked={Boolean(autoScroll)}
                    onChange={(e) => onAutoScroll(e.target.checked)}
                  />
                </label>
              ) : null}
              <div className="rounded-xl bg-white p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  Скорость {resolvedScrollSpeedLevel}
                </p>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={resolvedScrollSpeedLevel}
                  onChange={(e) => setResolvedScrollSpeedLevel(Number(e.target.value))}
                  className="h-11 w-full accent-primary"
                />
                <p className="text-xs tabular-nums opacity-80">{20 + (resolvedScrollSpeedLevel - 1) * 20} px/с</p>
                {(onAutoScrollStart || onAutoScrollStop) && (
                  <div className="mt-2 flex gap-2">
                    {onAutoScrollStart ? (
                      <button
                        type="button"
                        onClick={onAutoScrollStart}
                        className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Запустить
                      </button>
                    ) : null}
                    {onAutoScrollStop ? (
                      <button
                        type="button"
                        onClick={onAutoScrollStop}
                        className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        Стоп
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
