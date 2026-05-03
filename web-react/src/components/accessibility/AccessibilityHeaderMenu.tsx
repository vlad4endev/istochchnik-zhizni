import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuEye, LuUndo2, LuX } from 'react-icons/lu';

export type AccessibilityHeaderMenuTone = 'on-gradient' | 'on-surface';

const SHEET_BREAKPOINT_PX = 640;

type PanelLayout = 'sheet' | 'popover';

type Props = {
  tone?: AccessibilityHeaderMenuTone;
  /** Дополнительные классы для круглой кнопки-триггера */
  triggerClassName?: string;
};

export function AccessibilityHeaderMenu({ tone = 'on-gradient', triggerClassName }: Props) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>('popover');
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 360 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const { resetA11y } = useAccessibilitySettings();

  const triggerBase =
    tone === 'on-gradient'
      ? 'tap-highlight-transparent flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98] motion-reduce:active:scale-100'
      : 'tap-highlight-transparent flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200/90 bg-white/85 text-stone-900 shadow-sm transition hover:bg-white active:scale-[0.98] motion-reduce:active:scale-100';

  const triggerClass = triggerClassName?.trim() ? triggerClassName : triggerBase;

  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const btn = btnRef.current;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 640;

      if (vw < SHEET_BREAKPOINT_PX) {
        setLayout('sheet');
        return;
      }

      setLayout('popover');
      if (!btn) return;

      const r = btn.getBoundingClientRect();
      const gutter = 12;
      const menuWidth = Math.min(380, Math.max(280, vw - gutter * 2));
      let left = r.right - menuWidth;
      left = Math.max(gutter, Math.min(left, vw - menuWidth - gutter));
      const topBelow = r.bottom + 8;
      setPanelPos({ top: topBelow, left, width: menuWidth });

      requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const ph = panel.offsetHeight;
        let top = topBelow;
        if (top + ph > vh - gutter) {
          top = Math.max(gutter, r.top - ph - 8);
        }
        setPanelPos({ top, left, width: menuWidth });
      });
    };

    update();
    const root = document.getElementById('root');
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    root?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      root?.removeEventListener('scroll', update);
    };
  }, [open]);

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
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      const panel = panelRef.current;
      const el = panel?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      window.setTimeout(() => el?.focus(), 0);
    } else if (wasOpenRef.current) {
      btnRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  const panelBaseClass =
    'z-[90] box-border min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl border border-stone-200/80 bg-white/90 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 sm:p-4 [touch-action:manipulation]';

  const panel = open ? (
    <div
      ref={panelRef}
      id={menuId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${menuId}-title`}
      className={
        layout === 'sheet'
          ? `${panelBaseClass} fixed inset-x-3 top-[max(0.5rem,env(safe-area-inset-top,0px))] mx-auto w-auto max-w-lg max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-var(--app-bottom-nav-total-height)))]`
          : `${panelBaseClass} fixed max-h-[min(85dvh,560px)]`
      }
      style={
        layout === 'sheet'
          ? undefined
          : {
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
            }
      }
    >
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-stone-200/70 pb-3 sm:gap-3">
        <div className="min-w-0 pr-1">
          <p id={`${menuId}-title`} className="text-[15px] font-extrabold leading-tight text-stone-900">
            Доступность
          </p>
          <p className="mt-0.5 text-[12px] font-medium leading-snug text-stone-500">
            Сохраняется в этом браузере
          </p>
        </div>
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-stone-200/80 bg-white/90 text-stone-700 transition hover:bg-stone-50"
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
        >
          <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="min-w-0 pt-3 sm:pt-4">
        <AccessibilityControls
          formIdPrefix="a11y-header-menu"
          dense={layout === 'sheet'}
          stackThemes={layout === 'sheet'}
        />
      </div>

      <div className="mt-3 border-t border-stone-200/70 pt-3 sm:mt-4 sm:pt-3">
        <button
          type="button"
          onClick={() => {
            resetA11y();
            setOpen(false);
          }}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-200/90 bg-stone-50/95 px-3 text-[13px] font-bold text-stone-800 transition hover:bg-stone-100"
        >
          <LuUndo2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Сбросить всё
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={triggerClass}
        aria-label="Настройки доступности"
        title="Доступность"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <LuEye className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
