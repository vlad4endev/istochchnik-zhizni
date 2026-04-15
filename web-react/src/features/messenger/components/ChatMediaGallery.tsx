import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronLeft, LuChevronRight, LuLayers, LuX } from 'react-icons/lu';

export type ChatMediaItem = { messageId: string; src: string };

export function ChatMediaGallery({
  open,
  onClose,
  items,
  onOpenMessage,
}: {
  open: boolean;
  onClose: () => void;
  items: ChatMediaItem[];
  onOpenMessage?: (messageId: string) => void;
}) {
  const [lightIdx, setLightIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setLightIdx(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightIdx != null) setLightIdx(null);
        else onClose();
      }
      if (lightIdx == null || items.length === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLightIdx((i) => (i == null ? 0 : Math.max(0, i - 1)));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLightIdx((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, lightIdx, items.length, onClose]);

  const goPrev = useCallback(() => {
    setLightIdx((i) => {
      if (i == null) return 0;
      return Math.max(0, i - 1);
    });
  }, []);

  const goNext = useCallback(() => {
    setLightIdx((i) => {
      if (i == null) return 0;
      return Math.min(items.length - 1, i + 1);
    });
  }, [items.length]);

  if (!open || items.length === 0 || typeof document === 'undefined') return null;

  const viewerSrc = lightIdx != null ? items[lightIdx]?.src : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[6000] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="Медиа в чате"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-white">
          <LuLayers className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span className="truncate text-[15px] font-semibold">Медиа в чате</span>
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/90">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          aria-label="Закрыть"
        >
          <LuX className="h-6 w-6" strokeWidth={2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
          {items.map((it, idx) => (
            <button
              key={it.messageId}
              type="button"
              onClick={() => {
                setLightIdx(idx);
                onOpenMessage?.(it.messageId);
              }}
              className="relative aspect-square overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition hover:ring-2 hover:ring-primary/60"
              aria-label="Открыть фото"
            >
              <img src={it.src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      {viewerSrc ? (
        <div
          className="absolute inset-0 z-[1] flex flex-col bg-black/95"
          role="presentation"
          onClick={() => setLightIdx(null)}
        >
          <div className="flex shrink-0 justify-end p-2">
            <button
              type="button"
              onClick={() => setLightIdx(null)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
              aria-label="Закрыть просмотр"
            >
              <LuX className="h-6 w-6" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6">
            {lightIdx != null && lightIdx > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-1 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-3"
                aria-label="Предыдущее"
              >
                <LuChevronLeft className="h-7 w-7" />
              </button>
            ) : null}
            <img
              src={viewerSrc}
              alt=""
              className="max-h-[min(78vh,900px)] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {lightIdx != null && lightIdx < items.length - 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-1 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-3"
                aria-label="Следующее"
              >
                <LuChevronRight className="h-7 w-7" />
              </button>
            ) : null}
          </div>
          {lightIdx != null ? (
            <p className="shrink-0 pb-4 text-center text-[12px] text-white/60">
              {lightIdx + 1} / {items.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
