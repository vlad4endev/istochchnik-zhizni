import { useEffect, useMemo } from 'react';
import DocViewer, { DocViewerRenderers } from 'react-doc-viewer';
import { LuX } from 'react-icons/lu';

import { useMobileBottomNavLock } from '../app/useMobileBottomNavLock';

const PREVIEWABLE_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
]);

const MIME_TO_FILE_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
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
  useMobileBottomNavLock(open);
  const docs = useMemo(() => {
    if (!fileUrl) return [];
    return [
      {
        uri: fileUrl,
        fileName,
        fileType: inferFileType(fileName, fileMime),
      },
    ];
  }, [fileUrl, fileName, fileMime]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !fileUrl) return null;

  return (
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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            aria-label="Закрыть просмотр документа"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DocViewer
            documents={docs}
            pluginRenderers={DocViewerRenderers}
            config={{
              header: {
                disableHeader: true,
                disableFileName: true,
                retainURLParams: true,
              },
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
