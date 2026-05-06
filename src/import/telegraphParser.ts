import { safeFetchUrlForSongImport } from '../utils/safeUrlTextFetch';

function isTelegraphUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'telegra.ph' || u.hostname.endsWith('.telegra.ph'));
  } catch {
    return false;
  }
}

/**
 * Скачивает текст статьи с Telegraph. Возвращает null при сетевых ошибках/403/404/таймауте,
 * чтобы импорт мог продолжаться (песня будет помечена needs_retry).
 */
export async function fetchTelegraphText(url: string): Promise<string | null> {
  const u = (url ?? '').trim();
  if (!u || !isTelegraphUrl(u)) return null;

  try {
    const fetched = await safeFetchUrlForSongImport(u);
    if (fetched.kind !== 'text') return null;
    const text = String(fetched.text ?? '').trim();
    return text || null;
  } catch (e) {
    return null;
  }
}

export type TelegraphFetchResult =
  | { ok: true; text: string }
  | { ok: false; text: null; needsRetry: boolean; error: string; retryAfterMs?: number };

/**
 * То же, что fetchTelegraphText, но возвращает причину и флаг needsRetry.
 * Используется импорт-менеджером для корректной статистики/повтора.
 */
export async function fetchTelegraphTextDetailed(url: string): Promise<TelegraphFetchResult> {
  const u = (url ?? '').trim();
  if (!u || !isTelegraphUrl(u)) {
    return { ok: false, text: null, needsRetry: false, error: 'Некорректная ссылка Telegraph' };
  }
  try {
    const fetched = await safeFetchUrlForSongImport(u);
    if (fetched.kind !== 'text') {
      return { ok: false, text: null, needsRetry: false, error: 'По ссылке получен не текст' };
    }
    const text = String(fetched.text ?? '').trim();
    if (!text) {
      return { ok: false, text: null, needsRetry: false, error: 'Пустой текст Telegraph' };
    }
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const needsRetry = /кодом 403/i.test(msg) || /Превышено время ожидания/i.test(msg) || /время ожидания/i.test(msg);
    const retryAfterMs = /кодом 403/i.test(msg) ? 30_000 : undefined;
    return { ok: false, text: null, needsRetry, error: msg || 'Ошибка загрузки Telegraph', ...(retryAfterMs ? { retryAfterMs } : {}) };
  }
}

