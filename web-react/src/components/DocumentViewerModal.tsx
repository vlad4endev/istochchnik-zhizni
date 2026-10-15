import { useEffect, useMemo, useRef, useState } from 'react';
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer';
import '@cyntler/react-doc-viewer/dist/index.css';
import { renderAsync } from 'docx-preview';
import { LuDownload, LuX } from 'react-icons/lu';
import { pdfjs } from 'react-pdf';

import { fetchAuthenticatedBlob, isMessengerAttachmentFileUrl } from '../lib/fetchAuthenticatedBlob';
import { BodyPortal } from './BodyPortal';
import {
  inferDocumentFileType,
  isDocxDocument,
  isPublicHttpDocumentUrl,
} from './documentPreviewTypes';

export { canPreviewDocumentInline, canOpenDocumentViewer } from './documentPreviewTypes';

// Локальный worker (совпадает с pdfjs из react-pdf / @cyntler), без CDN и без проблем MIME у nginx.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'docx'; blobUrl: string }
  | { kind: 'docviewer'; uri: string; blobUrl: string | null; fileType?: string }
  | { kind: 'error' };

interface DocumentViewerModalProps {
  open: boolean;
  /** URL для скачивания / auth-загрузки (обычно attachment-file). */
  fileUrl: string | null;
  /**
   * URL для превью. Для Office (не docx) — подписанный публичный URL.
   * Если не задан, используется fileUrl.
   */
  viewUrl?: string | null;
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

async function downloadViaAuthOrLink(url: string, fileName: string): Promise<void> {
  try {
    const blob = await fetchAuthenticatedBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    triggerBlobDownload(objectUrl, fileName);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = fileName.trim() || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function DocumentViewerModal({
  open,
  fileUrl,
  viewUrl = null,
  fileName,
  fileMime = '',
  onClose,
}: DocumentViewerModalProps) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const docxHostRef = useRef<HTMLDivElement | null>(null);
  const fileType = inferDocumentFileType(fileName, fileMime);
  const isDocx = isDocxDocument(fileName, fileMime);
  const previewUri = (viewUrl && viewUrl.trim()) || fileUrl || '';

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
        // .docx: локальный рендер из blob (не зависит от Office Online / публичного URL).
        if (isDocx) {
          const blob = await fetchAuthenticatedBlob(fileUrl);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setState({ kind: 'docx', blobUrl: objectUrl });
          return;
        }

        // Office Online (doc/xls/ppt…): нужен публичный HTTPS URL.
        if (isPublicHttpDocumentUrl(previewUri)) {
          setState({
            kind: 'docviewer',
            uri: previewUri,
            blobUrl: null,
            fileType,
          });
          return;
        }

        // PDF / текст / картинки — blob + DocViewer.
        const blob = await fetchAuthenticatedBlob(fileUrl);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({
          kind: 'docviewer',
          uri: objectUrl,
          blobUrl: objectUrl,
          fileType,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, fileUrl, previewUri, fileType, isDocx]);

  useEffect(() => {
    if (state.kind !== 'docx') return undefined;
    const host = docxHostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    host.replaceChildren();

    void (async () => {
      try {
        const res = await fetch(state.blobUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled || !docxHostRef.current) return;
        await renderAsync(buffer, docxHostRef.current, undefined, {
          className: 'messenger-docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  const documents = useMemo(() => {
    if (state.kind !== 'docviewer') return [];
    return [
      {
        uri: state.uri,
        fileName: fileName || 'Документ',
        fileType: state.fileType || fileType,
      },
    ];
  }, [state, fileName, fileType]);

  if (!open || !fileUrl) return null;

  const downloadTarget = fileUrl;
  const canQuickDownload =
    state.kind === 'docx' ||
    (state.kind === 'docviewer' && (state.blobUrl != null || isMessengerAttachmentFileUrl(downloadTarget)));

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
              {canQuickDownload ? (
                <button
                  type="button"
                  onClick={() => {
                    if (state.kind === 'docx') {
                      triggerBlobDownload(state.blobUrl, fileName);
                      return;
                    }
                    if (state.kind === 'docviewer' && state.blobUrl) {
                      triggerBlobDownload(state.blobUrl, fileName);
                      return;
                    }
                    void downloadViaAuthOrLink(downloadTarget, fileName);
                  }}
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
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-stone-600">
                <p>Не удалось показать документ.</p>
                <button
                  type="button"
                  onClick={() => void downloadViaAuthOrLink(downloadTarget, fileName)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-white"
                >
                  <LuDownload className="h-4 w-4" />
                  Скачать файл
                </button>
              </div>
            ) : null}
            {state.kind === 'docx' ? (
              <div className="h-full overflow-auto p-3 sm:p-4">
                <div ref={docxHostRef} className="mx-auto max-w-[900px] rounded-lg bg-white shadow-sm" />
              </div>
            ) : null}
            {state.kind === 'docviewer' ? (
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
                          onClick={() => void downloadViaAuthOrLink(downloadTarget, fileName)}
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
