import type { SermonNoteBodyFormat } from './api';

/** Convert stored body into TipTap-ready HTML. */
export function bodyToEditorHtml(body: string, format: SermonNoteBodyFormat | undefined): string {
  const raw = body ?? '';
  if (!raw.trim()) return '';
  if (format === 'html' || /^\s*</.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br>');
      return `<p>${lines || '<br>'}</p>`;
    })
    .join('');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-text preview for list rows from HTML or plain body. */
export function bodyPlainPreview(body: string, format: SermonNoteBodyFormat | undefined, max = 120): string {
  const raw = body ?? '';
  if (!raw.trim()) return '';
  const text =
    format === 'html' || /^\s*</.test(raw)
      ? raw
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim()
      : raw.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
