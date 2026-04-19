import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSlidersHorizontal, LuUndo2, LuX } from 'react-icons/lu';
import { AccessibilityControls } from './AccessibilityControls';

export function AccessibilityToolbar() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { resetA11y } = useAccessibilitySettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    el?.focus();
  }, [open]);

  const node = (
    <div
      ref={wrapRef}
      id="a11y-toolbar-host"
      className="pointer-events-none fixed bottom-[max(5.75rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] right-4 z-[68] flex flex-col items-end gap-2 md:bottom-6 md:right-6"
    >
      {open ? (
        <nav
          id={panelId}
          aria-label="Панель настройки доступности"
          className="a11y-toolbar-panel pointer-events-auto max-h-[min(72vh,520px)] w-[min(calc(100vw-2rem),380px)] overflow-y-auto rounded-3xl border border-white/40 bg-white/75 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/65"
        >
          <div className="flex items-start justify-between gap-3 border-b border-stone-200/60 pb-3">
            <div>
              <p className="text-[15px] font-extrabold leading-tight text-stone-900">Доступность</p>
              <p className="mt-0.5 text-[12px] font-medium leading-snug text-stone-500">
                Тема, текст и отображение. Настройки сохраняются на этом устройстве.
              </p>
            </div>
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-stone-200/80 bg-white/80 text-stone-700 transition hover:bg-white"
              onClick={() => setOpen(false)}
              aria-label="Закрыть панель доступности"
            >
              <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="pt-4">
            <AccessibilityControls formIdPrefix="a11y-float" />
          </div>

          <div className="mt-4 border-t border-stone-200/60 pt-3">
            <button
              type="button"
              onClick={() => {
                resetA11y();
                setOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-200/90 bg-stone-50/90 px-3 text-[13px] font-bold text-stone-800 transition hover:bg-stone-100"
            >
              <LuUndo2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              Сбросить всё
            </button>
          </div>
        </nav>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full border border-white/45 bg-[color:color-mix(in_srgb,var(--primary)_92%,white)] text-[color:var(--text-on-primary)] shadow-[0_12px_40px_color-mix(in_srgb,var(--primary)_35%,transparent)] backdrop-blur-md transition hover:scale-[1.03] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100"
        title="Настройки доступности"
      >
        <LuSlidersHorizontal className="h-6 w-6" strokeWidth={2} aria-hidden />
        <span className="sr-only">{open ? 'Закрыть настройки доступности' : 'Открыть настройки доступности'}</span>
      </button>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
