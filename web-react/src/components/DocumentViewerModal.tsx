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
import styles from './DocumentViewerModal.module.css';

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

function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return compact;
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
  const viewerHostRef = useRef<HTMLDivElement | null>(null);
  const fileType = inferDocumentFileType(fileName, fileMime);
  const isDocx = isDocxDocument(fileName, fileMime);
  const previewUri = (viewUrl && viewUrl.trim()) || fileUrl || '';
  const isCompact = useIsCompactViewport();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Блокируем только скролл фона. Не ставим touch-action: none — иначе
  // на iOS/Android нельзя прокрутить сам документ внутри модалки.
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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
          // На узких экранах подгоняем страницу под ширину контейнера.
          ignoreWidth: true,
          ignoreHeight: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  // DocViewer мерит rendererRect по контейнеру — после монтирования дергаем resize,
  // чтобы PDF пересчитал width/height под актуальный размер модалки.
  useEffect(() => {
    if (state.kind !== 'docviewer') return undefined;
    const host = viewerHostRef.current;
    if (!host) return undefined;

    const kick = () => {
      window.dispatchEvent(new Event('resize'));
    };
    const raf = window.requestAnimationFrame(kick);
    const t = window.setTimeout(kick, 120);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(kick) : null;
    ro?.observe(host);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [state.kind, isCompact]);

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

  const pdfZoom = useMemo(
    () => ({
      // На мобиле чуть меньше стартовый zoom — страница лучше влезает по ширине.
      defaultZoom: isCompact ? 0.85 : 1,
      zoomJump: isCompact ? 0.15 : 0.2,
    }),
    [isCompact],
  );

  if (!open || !fileUrl) return null;

  const downloadTarget = fileUrl;
  const canQuickDownload =
    state.kind === 'docx' ||
    (state.kind === 'docviewer' && (state.blobUrl != null || isMessengerAttachmentFileUrl(downloadTarget)));

  const onDownload = () => {
    if (state.kind === 'docx') {
      triggerBlobDownload(state.blobUrl, fileName);
      return;
    }
    if (state.kind === 'docviewer' && state.blobUrl) {
      triggerBlobDownload(state.blobUrl, fileName);
      return;
    }
    void downloadViaAuthOrLink(downloadTarget, fileName);
  };

  return (
    <BodyPortal>
      <div
        className={styles.backdrop}
        role="dialog"
        aria-modal="true"
        aria-label={`Просмотр документа ${fileName}`}
        onClick={onClose}
      >
        <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
          <div className={styles.header}>
            <p className={styles.title}>{fileName}</p>
            <div className={styles.headerActions}>
              {canQuickDownload ? (
                <button
                  type="button"
                  onClick={onDownload}
                  className={styles.iconBtn}
                  aria-label="Скачать документ"
                >
                  <LuDownload className="h-5 w-5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className={styles.iconBtn}
                aria-label="Закрыть просмотр документа"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className={styles.body}>
            {state.kind === 'loading' || state.kind === 'idle' ? (
              <p className={styles.status} role="status">
                Загрузка…
              </p>
            ) : null}

            {state.kind === 'error' ? (
              <div className={styles.errorBox}>
                <p>Не удалось показать документ.</p>
                <button type="button" onClick={onDownload} className={styles.downloadBtn}>
                  <LuDownload className="h-4 w-4" />
                  Скачать файл
                </button>
              </div>
            ) : null}

            {state.kind === 'docx' ? (
              <div className={styles.docxScroll}>
                <div ref={docxHostRef} className={styles.docxHost} />
              </div>
            ) : null}

            {state.kind === 'docviewer' ? (
              <div ref={viewerHostRef} className={styles.viewerHost}>
                <DocViewer
                  key={`doc-${isCompact ? 'm' : 'd'}-${documents[0]?.uri ?? ''}`}
                  documents={documents}
                  pluginRenderers={DocViewerRenderers}
                  language="ru"
                  prefetchMethod="GET"
                  style={{ width: '100%', height: '100%' }}
                  config={{
                    header: {
                      disableHeader: true,
                      disableFileName: true,
                    },
                    pdfVerticalScrollByDefault: true,
                    pdfZoom,
                    noRenderer: {
                      overrideComponent: () => (
                        <div className={styles.errorBox}>
                          <p>Просмотр этого формата недоступен в браузере.</p>
                          <button type="button" onClick={onDownload} className={styles.downloadBtn}>
                            <LuDownload className="h-4 w-4" />
                            Скачать файл
                          </button>
                        </div>
                      ),
                    },
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
