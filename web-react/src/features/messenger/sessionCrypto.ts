/**
 * Session-inspired client identity + E2EE helpers (Web Crypto ECDH P-256 + AES-GCM).
 * Private key stays in localStorage; public key is published to the server.
 */

const STORAGE_KEY = 'messenger:session-crypto:v1';
const ACCOUNT_ID_PREFIX = '05';

export type StoredSessionKeypair = {
  v: 1;
  memberId: number;
  publicKeySpkiB64: string;
  privateKeyPkcs8B64: string;
  createdAt: string;
};

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64ToBuf(spkiB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

async function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    b64ToBuf(pkcs8B64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

export function readStoredSessionKeypair(memberId: number): StoredSessionKeypair | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSessionKeypair;
    if (!parsed || parsed.v !== 1 || parsed.memberId !== memberId) return null;
    if (!parsed.publicKeySpkiB64 || !parsed.privateKeyPkcs8B64) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSessionKeypair(kp: StoredSessionKeypair): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kp));
}

export async function ensureLocalSessionKeypair(memberId: number): Promise<StoredSessionKeypair> {
  const existing = readStoredSessionKeypair(memberId);
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const stored: StoredSessionKeypair = {
    v: 1,
    memberId,
    publicKeySpkiB64: bufToB64(spki),
    privateKeyPkcs8B64: bufToB64(pkcs8),
    createdAt: new Date().toISOString(),
  };
  writeStoredSessionKeypair(stored);
  return stored;
}

/** Display helper: group Session-like id for copy UI. */
export function formatMessengerAccountIdForDisplay(accountId: string): string {
  const id = accountId.trim();
  if (id.length !== 66 || !id.startsWith(ACCOUNT_ID_PREFIX)) return id;
  const body = id.slice(2);
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += 8) parts.push(body.slice(i, i + 8));
  return `${ACCOUNT_ID_PREFIX} ${parts.join(' ')}`;
}

export type E2eeEnvelopeV1 = {
  v: 1;
  alg: 'ECDH-P256+AES-GCM';
  iv: string;
  ct: string;
};

async function deriveAesKey(
  privateKey: CryptoKey,
  peerPublicSpkiB64: string,
): Promise<CryptoKey> {
  const peerPub = await importPublicKey(peerPublicSpkiB64);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPub }, privateKey, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptTextForPeer(
  memberId: number,
  peerPublicKeySpkiB64: string,
  plaintext: string,
): Promise<string | null> {
  const stored = readStoredSessionKeypair(memberId);
  if (!stored || !peerPublicKeySpkiB64.trim() || !plaintext) return null;
  try {
    const privateKey = await importPrivateKey(stored.privateKeyPkcs8B64);
    const aes = await deriveAesKey(privateKey, peerPublicKeySpkiB64.trim());
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aes,
      new TextEncoder().encode(plaintext),
    );
    const envelope: E2eeEnvelopeV1 = {
      v: 1,
      alg: 'ECDH-P256+AES-GCM',
      iv: bufToB64(iv.buffer),
      ct: bufToB64(ct),
    };
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

export async function decryptTextFromPeer(
  memberId: number,
  peerPublicKeySpkiB64: string,
  encryptedPayload: string,
): Promise<string | null> {
  const stored = readStoredSessionKeypair(memberId);
  if (!stored || !peerPublicKeySpkiB64.trim() || !encryptedPayload.trim()) return null;
  try {
    const envelope = JSON.parse(encryptedPayload) as E2eeEnvelopeV1;
    if (!envelope || envelope.v !== 1 || envelope.alg !== 'ECDH-P256+AES-GCM') return null;
    const privateKey = await importPrivateKey(stored.privateKeyPkcs8B64);
    const aes = await deriveAesKey(privateKey, peerPublicKeySpkiB64.trim());
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(envelope.iv)) },
      aes,
      b64ToBuf(envelope.ct),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export function parseSessionIdFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ACCOUNT_RE = /^05[0-9a-fA-F]{64}$/;
  const compact = trimmed.replace(/[\s\-]/g, '');
  if (ACCOUNT_RE.test(compact)) return `05${compact.slice(2).toLowerCase()}`;
  try {
    const parsed = JSON.parse(trimmed) as { id?: unknown; accountId?: unknown; type?: unknown };
    const id = typeof parsed.id === 'string' ? parsed.id : typeof parsed.accountId === 'string' ? parsed.accountId : '';
    const n = id.replace(/[\s\-]/g, '');
    if (ACCOUNT_RE.test(n)) return `05${n.slice(2).toLowerCase()}`;
  } catch {
    /* not JSON */
  }
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://local.invalid';
    const url = new URL(trimmed, base);
    const q =
      url.searchParams.get('sessionId') ||
      url.searchParams.get('accountId') ||
      url.searchParams.get('add');
    if (q) {
      const n = q.replace(/[\s\-]/g, '');
      if (ACCOUNT_RE.test(n)) return `05${n.slice(2).toLowerCase()}`;
    }
  } catch {
    /* not URL */
  }
  return null;
}
