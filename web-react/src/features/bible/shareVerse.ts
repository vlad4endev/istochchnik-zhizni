import { emitAppToast } from '@/lib/uiFeedback';

export type ShareVerseInput = {
  reference: string;
  text: string;
  translationTitle: string;
  url: string;
};

function buildShareText({ reference, text, translationTitle }: ShareVerseInput): string {
  return `«${text.trim()}»\n\n${reference} (${translationTitle})`;
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function shareBibleVerse(input: ShareVerseInput): Promise<void> {
  const shareText = buildShareText(input);
  const fullText = `${shareText}\n${input.url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: input.reference, text: shareText, url: input.url });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      /* fall through to clipboard copy */
    }
  }

  const copied = await copyToClipboard(fullText);
  emitAppToast(copied ? 'Стих скопирован в буфер обмена' : 'Не удалось поделиться стихом', copied ? 'success' : 'error');
}
