import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type EncryptedPayload = {
  iv: string;
  encryptedData: string;
};

let cachedKey: Buffer | null | undefined;
let warnedInvalidKey = false;

function resolveKey(): Buffer | null {
  if (cachedKey !== undefined) {
    return cachedKey;
  }
  const raw = String(process.env.MESSAGE_ENCRYPTION_KEY ?? '').trim();
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    if (!warnedInvalidKey) {
      warnedInvalidKey = true;
      console.warn(
        '[messageCrypto] MESSAGE_ENCRYPTION_KEY must be 64 hex chars; fallback to plaintext mode.',
      );
    }
    cachedKey = null;
    return cachedKey;
  }
  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
}

export function isMessageEncryptionEnabled(): boolean {
  return resolveKey() != null;
}

function parseEncryptedPayload(raw: string): EncryptedPayload | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<EncryptedPayload> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const iv = typeof parsed.iv === 'string' ? parsed.iv.trim() : '';
    const encryptedData =
      typeof parsed.encryptedData === 'string' ? parsed.encryptedData.trim() : '';
    if (!/^[0-9a-fA-F]{32}$/.test(iv) || !/^[0-9a-fA-F]+$/.test(encryptedData)) {
      return null;
    }
    return { iv, encryptedData };
  } catch {
    return null;
  }
}

export function encryptMessageText(text: string): string {
  const key = resolveKey();
  if (!key || !text) {
    return text;
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted =
    cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return JSON.stringify({
    iv: iv.toString('hex'),
    encryptedData: encrypted,
  });
}

export function decryptMessageText(text: string): string {
  const key = resolveKey();
  if (!key || !text) {
    return text;
  }
  const payload = parseEncryptedPayload(text);
  if (!payload) {
    return text;
  }
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(payload.iv, 'hex'));
    const decrypted =
      decipher.update(payload.encryptedData, 'hex', 'utf8') + decipher.final('utf8');
    return decrypted;
  } catch {
    return text;
  }
}
