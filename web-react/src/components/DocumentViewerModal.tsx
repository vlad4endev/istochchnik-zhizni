import { useEffect, useRef, useState } from 'react';
import { LuX } from 'react-icons/lu';

import { ensurePdfjsWorker } from '../lib/pdfjsMainThread';
import { BodyPortal } from './BodyPortal';

/** Встроенный просмотр: PDF (pdf.js) и простой текст. Office-форматы открываются во вкладке/скачиваются. */
const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'txt', 'csv']);

const MAX_PDF_PAGES = 100;
const MAX_TEXT_CHARS = 500_000;

const MIME_TO_FILE_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

function fileExtension(name: string): string {
  const n = String(name ?? '').trim().toLowerCase();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return '';
  return n.slice(i + 1);
}

function inferFileType(name: string, mimeRaw: string): string | undefined {
  const mime = String(mimeRaw ?? '').split(';')[0].trim().toLowerCase();
  if (mime && MIME_TO_FILE_TYPE[mime]) return MIME_TO_FILE_TYPE[mime];
  const ext = fileExtension(name);
  return ext || undefined;
}

export function canPreviewDocumentInline(name: string, mimeRaw: string): boolean {
  const mime = String(mimeRaw ?? '').split(';')[0].trim().toLowerCase();
  if (mime && MIME_TO_FILE_TYPE[mime]) return true;
  const ext = fileExtension(name);
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'pdf' };

interface DocumentViewerModalProps {
  open: boolean;
  fileUrl: string | null;
  fileName: string;
  fileMime?: string;
  onClose: () => void;
}

export function DocumentViewerModal({
  open,
  fileUrl,
  fileName,
  fileMime = '',
  onClose,
}: DocumentViewerModalProps) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const fileType = inferFileType(fileName, fileMime);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !fileUrl) return undefined;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    setState({ kind: 'loading' });

    const run = async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (fileType === 'pdf') {
          const data = new Uint8Array(await res.arrayBuffer());
          const [pdfjs] = await Promise.all([import('pdfjs-dist'), ensurePdfjsWorker()]);
          if (cancelled) return;
          const task = pdfjs.getDocument({ data, useSystemFonts: true });
          destroy = () => void task.destroy();
          const pdf = await task.promise;
          if (cancelled) return;
          setState({ kind: 'pdf' });
          // Дожидаемся, пока React смонтирует контейнер страниц.
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          const host = pagesRef.current;
          if (!host || cancelled) return;
          host.replaceChildren();
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const width = Math.max(host.clientWidth, 200);
          const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
          for (let n = 1; n <= total; n += 1) {
            const page = await pdf.getPage(n);
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            const scale = width / base.width;
            const viewport = page.getViewport({ scale: scale * dpr });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            canvas.style.display = 'block';
            canvas.style.marginBottom = '8px';
            canvas.style.background = '#fff';
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('canvas');
            host.appendChild(canvas);
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
          return;
        }

        const raw = await res.text();
        if (cancelled) return;
        const truncated = raw.length > MAX_TEXT_CHARS;
        setState({
          kind: 'text',
          text: truncated ? raw.slice(0, MAX_TEXT_CHARS) : raw,
          truncated,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    };
    void run();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [open, fileUrl, fileType]);

  if (!open || !fileUrl) return null;

  return (
    <BodyPortal><div
      className="fixed inset-0 z-[5200] bg-black/70 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр документа ${fileName}`}
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3 py-2.5 sm:px-4">
          <p className="min-w-0 truncate text-sm font-semibold text-stone-800">{fileName}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            aria-label="Закрыть просмотр документа"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-stone-100 p-2 sm:p-3">
          {state.kind === 'loading' ? (
            <p className="p-4 text-center text-sm text-stone-500" role="status">
              Загрузка…
            </p>
          ) : null}
          {state.kind === 'error' ? (
            <div className="p-4 text-center text-sm text-stone-600">
              <p>Не удалось показать документ.</p>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-semibold text-primary"
              >
                Открыть в новой вкладке
              </a>
            </div>
          ) : null}
          {state.kind === 'text' ? (
            <>
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-sm text-stone-800">
                {state.text}
              </pre>
              {state.truncated ? (
                <p className="mt-2 text-center text-xs text-stone-500">Показана только часть файла.</p>
              ) : null}
            </>
          ) : null}
          <div ref={pagesRef} />
        </div>
      </div>
    </div></BodyPortal>
  );
}
