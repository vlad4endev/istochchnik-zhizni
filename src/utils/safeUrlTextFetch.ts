/** Загрузка текста по HTTP(S) с базовой защитой от SSRF (только публичные хосты, лимит размера). */

const MAX_BYTES = 1_500_000;
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

function allowedContentType(ct: string, pathname: string): boolean {
  const lower = ct.toLowerCase().split(';')[0]?.trim() ?? '';
  if (lower.startsWith('text/')) {
    if (lower === 'text/html' || lower === 'text/xml') return false;
    return true;
  }
  if (lower === 'application/json') return true;
  if (lower === 'application/octet-stream' || lower === 'binary/octet-stream') {
    return /\.(txt|cho|chopro|chordpro|cpm|pro)$/i.test(pathname);
  }
  return false;
}

function bufferToUtf8(buf: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

export async function safeFetchUrlAsText(urlString: string): Promise<{ text: string; contentType: string }> {
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

  if (url.username || url.password) {
    throw new Error('Ссылки с логином и паролем не поддерживаются');
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
          Accept: 'text/plain,text/html;q=0.3,application/json;q=0.5,*/*;q=0.1',
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

      const len = res.headers.get('content-length');
      if (len && Number(len) > MAX_BYTES) {
        throw new Error('Файл по ссылке слишком большой (лимит 1,5 МБ)');
      }

      const ct = res.headers.get('content-type') ?? '';
      if (!allowedContentType(ct, u.pathname)) {
        throw new Error(
          'Поддерживаются текстовые ответы (text/*, JSON) или .txt по ссылке. Для PDF используйте загрузку файла.',
        );
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        throw new Error('Ответ слишком большой (лимит 1,5 МБ)');
      }

      return { text: bufferToUtf8(buf), contentType: ct };
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
