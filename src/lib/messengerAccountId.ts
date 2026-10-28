import { createHash, randomBytes } from 'node:crypto';

/** Session-like account id: prefix `05` + 64 hex chars (66 total). */
export const MESSENGER_ACCOUNT_ID_PREFIX = '05';
export const MESSENGER_ACCOUNT_ID_HEX_LEN = 64;
export const MESSENGER_ACCOUNT_ID_TOTAL_LEN =
  MESSENGER_ACCOUNT_ID_PREFIX.length + MESSENGER_ACCOUNT_ID_HEX_LEN;

const ACCOUNT_ID_RE = new RegExp(
  `^${MESSENGER_ACCOUNT_ID_PREFIX}[0-9a-fA-F]{${MESSENGER_ACCOUNT_ID_HEX_LEN}}$`,
);

/** Normalize user/QR input: strip spaces, ignore `05:` / URL wrappers later. */
export function normalizeMessengerAccountId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  // Accept bare id, id with spaces/dashes, or trailing punctuation from OCR.
  s = s.replace(/[\s\-]/g, '');
  const urlMatch = s.match(/(?:sessionId|accountId|add)=([0-9a-fA-F]{66})/i);
  if (urlMatch) s = urlMatch[1];
  const pathMatch = s.match(/(?:\/session\/|messenger:\/\/session\/)([0-9a-fA-F]{66})/i);
  if (pathMatch) s = pathMatch[1];
  if (s.startsWith('{') && s.includes('id')) {
    try {
      const parsed = JSON.parse(s) as { id?: unknown; accountId?: unknown };
      const fromJson = parsed.id ?? parsed.accountId;
      if (typeof fromJson === 'string') s = fromJson.trim();
    } catch {
      /* not JSON */
    }
  }
  if (!ACCOUNT_ID_RE.test(s)) return null;
  return `${MESSENGER_ACCOUNT_ID_PREFIX}${s.slice(MESSENGER_ACCOUNT_ID_PREFIX.length).toLowerCase()}`;
}

export function isValidMessengerAccountId(raw: unknown): boolean {
  return normalizeMessengerAccountId(raw) != null;
}

/** Cryptographically random Session-style account id. */
export function generateMessengerAccountId(): string {
  const hex = randomBytes(MESSENGER_ACCOUNT_ID_HEX_LEN / 2).toString('hex');
  return `${MESSENGER_ACCOUNT_ID_PREFIX}${hex}`;
}

/** Deterministic id from public key material (stable across re-ensure). */
export function messengerAccountIdFromPublicKey(publicKey: string): string {
  const hash = createHash('sha256').update(String(publicKey).trim(), 'utf8').digest('hex');
  return `${MESSENGER_ACCOUNT_ID_PREFIX}${hash}`;
}

export type MessengerQrPayloadV1 = {
  v: 1;
  type: 'messenger_session';
  id: string;
};

export function buildMessengerQrPayload(accountId: string): MessengerQrPayloadV1 {
  const id = normalizeMessengerAccountId(accountId);
  if (!id) throw new Error('Invalid messenger account id');
  return { v: 1, type: 'messenger_session', id };
}

/** Deep-link path used inside the SPA and in QR (relative). */
export function messengerSessionDeepLinkPath(accountId: string): string {
  const id = normalizeMessengerAccountId(accountId);
  if (!id) throw new Error('Invalid messenger account id');
  return `/messenger?sessionId=${encodeURIComponent(id)}`;
}

export function parseMessengerQrScanText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = normalizeMessengerAccountId(trimmed);
  if (direct) return direct;
  try {
    const asUrl = new URL(trimmed, 'https://local.invalid');
    const fromQuery =
      asUrl.searchParams.get('sessionId') ||
      asUrl.searchParams.get('accountId') ||
      asUrl.searchParams.get('add');
    const fromQueryNorm = normalizeMessengerAccountId(fromQuery);
    if (fromQueryNorm) return fromQueryNorm;
  } catch {
    /* not a URL */
  }
  return normalizeMessengerAccountId(trimmed);
}
