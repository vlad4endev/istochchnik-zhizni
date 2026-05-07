/** Загрузка текста по HTTP(S) с базовой защитой от SSRF (только публичные хосты, лимит размера). */

const MAX_TEXT_BYTES = 1_500_000;
const MAX_PDF_BYTES = 6_000_000;
const MAX_REDIRECTS = 6;
const FETCH_TIMEOUT_MS = 18_000;

function isBlockedHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'metadata.google.internal' || h.endsWith('.internal')) return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].some((x) => x > 255)) return true;
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 255) return true;
  }

  if (h.includes(':')) {
    if (h === '::1') return true;
    const hl = h.replace(/^\[|\]$/g, '');
    if (hl.startsWith('fe80:')) return true;
    if (hl.startsWith('fc') || hl.startsWith('fd')) return true;
    if (hl.startsWith('::ffff:')) {
      const v4 = hl.slice('::ffff:'.length);
      if (isBlockedHostname(v4)) return true;
    }
  }

  return false;
}

/** Распознавание ответа для импорта песни: текст (в т.ч. ChordPro) или PDF. */
function songImportKind(contentType: string, pathname: string): 'text' | 'pdf' | null {
  const lower = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (lower === 'application/pdf') return 'pdf';
  if (lower === 'application/octet-stream' || lower === 'binary/octet-stream') {
    if (/\.pdf($|\?)/i.test(pathname)) return 'pdf';
    if (/\.(txt|cho|chopro|chordpro|cpm|pro)($|\?)/i.test(pathname)) return 'text';
    return null;
  }
  if (lower.startsWith('text/')) {
    if (lower === 'text/html' || lower === 'text/xml') return null;
    return 'text';
  }
  if (lower === 'application/json') return 'text';
  return null;
}

function bufferToUtf8(buf: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

function isTelegraphHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'telegra.ph' || h.endsWith('.telegra.ph');
}

function htmlToTextBasic(html: string): string {
  let s = html;
  // remove scripts/styles
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  // block breaks
  s = s.replace(/<(?:br)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(?:p|div|h1|h2|h3|h4|h5|h6|li|pre|blockquote|section|article)>/gi, '\n');
  // strip tags
  s = s.replace(/<[^>]+>/g, '');
  // decode minimal entities
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  // normalize whitespace
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function extractTelegraphArticleText(html: string): string {
  // Telegraph обычно содержит <article>...</article>. Если не нашли — fallback на весь документ.
  const m = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  const fragment = m?.[1] ?? html;
  return htmlToTextBasic(fragment);
}

export type SongUrlImportFetchResult =
  | { kind: 'text'; text: string; contentType: string }
  | { kind: 'pdf'; buffer: Buffer; contentType: string };

/**
 * Скачивает по ссылке текст (plain, ChordPro и т.д.) или PDF для последующего разбора.
 * PDF — только при явном application/pdf или .pdf при octet-stream.
 */
export async function safeFetchUrlForSongImport(urlString: string): Promise<SongUrlImportFetchResult> {
  let current = urlString.trim();
  if (!current) {
    throw new Error('Пустая ссылка');
  }

  let url: URL;
  try {
    url = new URL(current);
  } catch {
    throw new Error('Некорректная ссылка');
  }

  if (url.username || url.password) {
    throw new Error('Ссылки с логином и паролем не поддерживаются');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Разрешены только http и https');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('Этот адрес недоступен для импорта');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (u.username || u.password) {
        throw new Error('Ссылки с логином и паролем не поддерживаются');
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('Некорректный редирект');
      }
      if (isBlockedHostname(u.hostname)) {
        throw new Error('Редирект на недоступный адрес');
      }

      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/plain,application/pdf;q=0.6,text/html;q=0.3,application/json;q=0.5,*/*;q=0.1',
          'Accept-Language': 'ru,en;q=0.8',
          'User-Agent': 'IstochnikSongbookImport/1.0',
        },
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('Пустой редирект');
        current = new URL(loc, current).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`Сервер ответил кодом ${res.status}`);
      }

      const ct = res.headers.get('content-type') ?? '';
      const pathname = u.pathname;
      const kind = songImportKind(ct, pathname);
      if (!kind) {
        const ctLower = ct.toLowerCase().split(';')[0]?.trim() ?? '';
        if (ctLower === 'text/html' && isTelegraphHost(u.hostname)) {
          // Allow Telegraph HTML pages: extract article text server-side.
        } else {
          throw new Error(
            'Поддерживаются текст (text/*, JSON, .txt/.cho/.chordpro по ссылке) или PDF (application/pdf / файл .pdf). ' +
              'Также поддерживается Telegraph (telegra.ph) со страницей HTML.',
          );
        }
      }

      const ctLower = ct.toLowerCase().split(';')[0]?.trim() ?? '';
      const isTelegraphHtml = ctLower === 'text/html' && isTelegraphHost(u.hostname);
      const maxBytes = kind === 'pdf' ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
      const len = res.headers.get('content-length');
      if (len && Number(len) > maxBytes) {
        throw new Error(
          kind === 'pdf'
            ? 'PDF по ссылке слишком большой (лимит 6 МБ)'
            : 'Файл по ссылке слишком большой (лимит 1,5 МБ)',
        );
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        throw new Error(
          kind === 'pdf' ? 'PDF слишком большой (лимит 6 МБ)' : 'Ответ слишком большой (лимит 1,5 МБ)',
        );
      }

      if (kind === 'text' || isTelegraphHtml) {
        const rawText = bufferToUtf8(buf);
        const text = isTelegraphHtml ? extractTelegraphArticleText(rawText) : rawText;
        return { kind: 'text', text, contentType: ct };
      }

      const b = Buffer.from(buf);
      const head = b.subarray(0, Math.min(5, b.length)).toString('latin1');
      if (!head.startsWith('%PDF')) {
        throw new Error('Ответ объявлен как PDF, но данные не похожи на PDF');
      }
      return { kind: 'pdf', buffer: b, contentType: ct };
    }
    throw new Error('Слишком много редиректов');
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Превышено время ожидания');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
