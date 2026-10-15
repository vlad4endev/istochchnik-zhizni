/** Prefer meeting/template name from invite preview or call payload. */
export function meetingTitleFromPreview(
  preview: {
    title?: string | null;
    conversationTitle?: string | null;
    mediaType?: 'audio' | 'video';
  } | null,
  fallback?: string,
): string {
  const named = preview?.title?.trim() || preview?.conversationTitle?.trim();
  if (named) return named;
  if (fallback?.trim()) return fallback.trim();
  return preview?.mediaType === 'audio' ? 'Аудиовстреча' : 'Видеовстреча';
}
