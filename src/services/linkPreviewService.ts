import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  host: string;
};

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEG_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

const cache = new Map<string, { value: LinkPreview | null; expiresAt: number }>();

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80')) return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('private address');
    return;
  }
  if (/^localhost$|\.local$|\.internal$/i.test(hostname)) throw new Error('private host');
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('private address');
}

/** Agent, который повторно проверяет IP при соединении (защита от DNS-rebinding). */
const safeAgent = new Agent({
  connect: {
    lookup: (hostname, options, cb) => {
      dns
        .lookup(hostname, { all: true })
        .then((addrs) => {
          if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
            cb(new Error('private address') as NodeJS.ErrnoException, '', 4);
            return;
          }
          const first = addrs[0];
          if ((options as { all?: boolean })?.all) {
            (cb as unknown as (e: null, a: typeof addrs) => void)(null, addrs);
          } else {
            cb(null, first.address, first.family);
          }
        })
        .catch((e) => cb(e as NodeJS.ErrnoException, '', 4));
    },
  },
});

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function absolutize(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function clip(s: string | null | undefined, n: number): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, n) : null;
}

export function parseHtmlMeta(html: string, finalUrl: string): LinkPreview {
  const meta: Record<string, string> = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const a = parseAttrs(m[0]);
    const key = (a.property || a.name || '').toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let icon: string | null = null;
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html))) {
    const a = parseAttrs(m[0]);
    if (a.rel && /(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/i.test(a.rel) && a.href) {
      icon = a.href;
      break;
    }
  }
  const host = new URL(finalUrl).hostname.replace(/^www\./, '');
  return {
    url: finalUrl,
    title: clip(meta['og:title'] || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag) : ''), 160),
    description: clip(meta['og:description'] || meta['twitter:description'] || meta.description, 280),
    image: absolutize(meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'], finalUrl),
    siteName: clip(meta['og:site_name'], 80),
    favicon: absolutize(icon || '/favicon.ico', finalUrl),
    host,
  };
}

async function readLimited(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  void reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchPreview(rawUrl: string): Promise<LinkPreview | null> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    await assertPublicHost(u.hostname);
    const res = await undiciFetch(current, {
      method: 'GET',
      redirect: 'manual',
      dispatcher: safeAgent,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; IstochnikBot/1.0; +link-preview)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru,en;q=0.8',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) return null;
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    const host = new URL(current).hostname.replace(/^www\./, '');
    if (ctype.startsWith('image/')) {
      return { url: current, title: null, description: null, image: current, siteName: null, favicon: null, host };
    }
    if (!ctype.includes('html')) return null;
    const html = await readLimited(res.body as ReadableStream<Uint8Array> | null);
    const p = parseHtmlMeta(html, current);
    if (!p.title && !p.description && !p.image) return null;
    return p;
  }
  return null;
}

export async function getLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let normalized: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    normalized = u.toString();
  } catch {
    return null;
  }
  const hit = cache.get(normalized);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: LinkPreview | null = null;
  try {
    value = await fetchPreview(normalized);
  } catch {
    value = null;
  }
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(normalized, { value, expiresAt: Date.now() + (value ? CACHE_TTL_MS : NEG_CACHE_TTL_MS) });
  return value;
}
