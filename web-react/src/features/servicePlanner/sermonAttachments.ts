export type SermonAttachment = {
  id: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  uploaded_at?: string;
};

export const SERMON_ATTACHMENTS_CONTENT_KEY = 'sermon_attachments';

export const SERMON_ATTACHMENT_MAX_COUNT = 5;

export const SERMON_ATTACHMENT_ACCEPT =
  '.ppt,.pptx,.pdf,.doc,.docx,.odp,.key,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function asPositiveInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function parseSermonAttachments(contentJson: Record<string, unknown> | null | undefined): SermonAttachment[] {
  const raw = contentJson?.[SERMON_ATTACHMENTS_CONTENT_KEY];
  if (!Array.isArray(raw)) return [];
  const out: SermonAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const url = isNonEmptyString(row.url) ? row.url.trim() : '';
    const name = isNonEmptyString(row.name) ? row.name.trim() : '';
    if (!url || !name) continue;
    if (!(url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) continue;
    const id = isNonEmptyString(row.id) ? row.id.trim() : `${url}::${name}`;
    out.push({
      id,
      url,
      name,
      size: asPositiveInt(row.size),
      mime: isNonEmptyString(row.mime) ? row.mime.trim() : 'application/octet-stream',
      uploaded_at: isNonEmptyString(row.uploaded_at) ? row.uploaded_at.trim() : undefined,
    });
    if (out.length >= SERMON_ATTACHMENT_MAX_COUNT) break;
  }
  return out;
}

export function withSermonAttachments(
  contentJson: Record<string, unknown> | null | undefined,
  attachments: SermonAttachment[],
): Record<string, unknown> {
  const next = { ...(contentJson ?? {}) };
  if (attachments.length === 0) {
    delete next[SERMON_ATTACHMENTS_CONTENT_KEY];
  } else {
    next[SERMON_ATTACHMENTS_CONTENT_KEY] = attachments.map((a) => ({
      id: a.id,
      url: a.url,
      name: a.name,
      size: a.size,
      mime: a.mime,
      ...(a.uploaded_at ? { uploaded_at: a.uploaded_at } : {}),
    }));
  }
  return next;
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}

export function sermonAttachmentExtLabel(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toUpperCase() : 'FILE';
}

/** Имена вида «_ _ _.pptx» после старого бага latin1 — показываем понятную подпись. */
export function displaySermonAttachmentName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return 'Файл';
  const extMatch = /\.([a-z0-9]{1,12})$/i.exec(raw);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '';
  const stem = ext ? raw.slice(0, -ext.length) : raw;
  const meaningful = stem.replace(/[_\s.\-]+/g, '');
  if (meaningful.length > 0) return raw;
  const byExt: Record<string, string> = {
    '.ppt': 'Презентация',
    '.pptx': 'Презентация',
    '.pdf': 'Документ',
    '.doc': 'Документ',
    '.docx': 'Документ',
    '.odp': 'Презентация',
    '.key': 'Презентация',
  };
  const label = byExt[ext] ?? 'Файл';
  return ext ? `${label}${ext}` : label;
}
