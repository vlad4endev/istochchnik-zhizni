/** Форматы, которые рендерятся локально из blob (DocViewer / docx-preview). */
const LOCAL_PREVIEW_EXTENSIONS = new Set([
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
  'docx',
]);

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'odt', 'xls', 'xlsx', 'ppt', 'pptx']);

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
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
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

/** PDF/текст/картинки/docx — локальный превью без публичного URL. */
export function canPreviewDocumentInline(name: string, mimeRaw: string): boolean {
  const type = inferDocumentFileType(name, mimeRaw);
  if (type && LOCAL_PREVIEW_EXTENSIONS.has(type)) return true;
  const ext = documentFileExtension(name);
  return LOCAL_PREVIEW_EXTENSIONS.has(ext);
}

export function isDocxDocument(name: string, mimeRaw: string): boolean {
  return inferDocumentFileType(name, mimeRaw) === 'docx' || documentFileExtension(name) === 'docx';
}

/** Office-форматы, которым для MS Online Viewer нужен публичный/подписанный URL. */
export function isOfficeDocumentNeedingPublicUrl(name: string, mimeRaw: string): boolean {
  const type = inferDocumentFileType(name, mimeRaw);
  if (!type) {
    const ext = documentFileExtension(name);
    return OFFICE_EXTENSIONS.has(ext) && ext !== 'docx';
  }
  return OFFICE_EXTENSIONS.has(type) && type !== 'docx';
}

/** Можно открыть в модалке просмотра (локально или через Office Online). */
export function canOpenDocumentViewer(name: string, mimeRaw: string): boolean {
  if (canPreviewDocumentInline(name, mimeRaw)) return true;
  const type = inferDocumentFileType(name, mimeRaw);
  if (type && OFFICE_EXTENSIONS.has(type)) return true;
  return OFFICE_EXTENSIONS.has(documentFileExtension(name));
}

export function isPublicHttpDocumentUrl(url: string): boolean {
  const trimmed = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  // Прокси вложений требует auth — MS Office Online его не увидит.
  if (trimmed.includes('/attachment-file')) return false;
  return true;
}
