/** Форматы, которые DocViewer рендерит локально (blob: URI). Office — только публичные URL. */
const PREVIEWABLE_EXTENSIONS = new Set([
  'pdf',
  'txt',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'tiff',
  'tif',
]);

const MIME_TO_FILE_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
};

export function documentFileExtension(name: string): string {
  const n = String(name ?? '').trim().toLowerCase();
  const i = n.lastIndexOf('.');
  if (i <= 0 || i === n.length - 1) return '';
  return n.slice(i + 1);
}

export function inferDocumentFileType(name: string, mimeRaw: string): string | undefined {
  const mime = String(mimeRaw ?? '').split(';')[0].trim().toLowerCase();
  if (mime && MIME_TO_FILE_TYPE[mime]) return MIME_TO_FILE_TYPE[mime];
  const ext = documentFileExtension(name);
  return ext || undefined;
}

export function canPreviewDocumentInline(name: string, mimeRaw: string): boolean {
  const mime = String(mimeRaw ?? '').split(';')[0].trim().toLowerCase();
  if (mime && MIME_TO_FILE_TYPE[mime]) return true;
  const ext = documentFileExtension(name);
  return PREVIEWABLE_EXTENSIONS.has(ext);
}
