import { useEffect, useMemo, useState } from 'react';
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer';
import '@cyntler/react-doc-viewer/dist/index.css';
import { LuDownload, LuX } from 'react-icons/lu';
import { pdfjs } from 'react-pdf';

import { fetchAuthenticatedBlob } from '../lib/fetchAuthenticatedBlob';
import { BodyPortal } from './BodyPortal';
import { inferDocumentFileType } from './documentPreviewTypes';

export { canPreviewDocumentInline } from './documentPreviewTypes';

// Локальный worker (совпадает с pdfjs из react-pdf / @cyntler), без CDN и без проблем MIME у nginx.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; blobUrl: string; fileType?: string }
  | { kind: 'error' };

interface DocumentViewerModalProps {
  open: boolean;
  fileUrl: string | null;
  fileName: string;
  fileMime?: string;
  onClose: () => void;
}

function triggerBlobDownload(blobUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName.trim() || 'file';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function DocumentViewerModal({
  open,
  fileUrl,
  fileName,
  fileMime = '',
  onClose,
}: DocumentViewerModalProps) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const fileType = inferDocumentFileType(fileName, fileMime);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !fileUrl) {
      setState({ kind: 'idle' });
      return undefined;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const blob = await fetchAuthenticatedBlob(fileUrl);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ kind: 'ready', blobUrl: objectUrl, fileType });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, fileUrl, fileType]);

  const documents = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return [
      {
        uri: state.blobUrl,
        fileName: fileName || 'Документ',
        fileType: state.fileType || fileType,
      },
    ];
  }, [state, fileName, fileType]);

  if (!open || !fileUrl) return null;

  const readyBlobUrl = state.kind === 'ready' ? state.blobUrl : null;

  return (
    <BodyPortal>
      <div
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
            <div className="flex shrink-0 items-center gap-1">
              {readyBlobUrl ? (
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(readyBlobUrl, fileName)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                  aria-label="Скачать документ"
                >
                  <LuDownload className="h-5 w-5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                aria-label="Закрыть просмотр документа"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-stone-100">
            {state.kind === 'loading' || state.kind === 'idle' ? (
              <p className="p-4 text-center text-sm text-stone-500" role="status">
                Загрузка…
              </p>
            ) : null}
            {state.kind === 'error' ? (
              <div className="p-4 text-center text-sm text-stone-600">
                <p>Не удалось показать документ.</p>
                <p className="mt-1 text-xs text-stone-500">Попробуйте сохранить файл на устройство.</p>
              </div>
            ) : null}
            {state.kind === 'ready' ? (
              <DocViewer
                documents={documents}
                pluginRenderers={DocViewerRenderers}
                language="ru"
                prefetchMethod="GET"
                className="h-full min-h-0 !bg-stone-100"
                style={{ height: '100%', width: '100%' }}
                config={{
                  header: {
                    disableHeader: true,
                    disableFileName: true,
                  },
                  pdfVerticalScrollByDefault: true,
                  pdfZoom: {
                    defaultZoom: 1,
                    zoomJump: 0.2,
                  },
                  noRenderer: {
                    overrideComponent: () => (
                      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-stone-600">
                        <p>Просмотр этого формата недоступен в браузере.</p>
                        <button
                          type="button"
                          onClick={() => triggerBlobDownload(state.blobUrl, fileName)}
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white"
                        >
                          <LuDownload className="h-4 w-4" />
                          Скачать файл
                        </button>
                      </div>
                    ),
                  },
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
