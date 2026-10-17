import webpush from 'web-push';

import { query } from '../config/db';

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  source: 'env' | 'db';
};

let resolved: VapidConfig | null = null;

function normalizeSubject(raw: string): string {
  const s = raw.trim();
  return /^(mailto:|https?:\/\/)/i.test(s) ? s : `mailto:${s}`;
}

function fallbackSubject(): string {
  const origin = String(process.env.PUBLIC_WEB_ORIGIN ?? '').trim();
  if (/^https:\/\//i.test(origin)) return origin.replace(/\/+$/, '');
  return 'mailto:admin@example.com';
}

function readEnvConfig(): VapidConfig | null {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? '').trim();
  if (!publicKey || !privateKey) return null;
  const subjectRaw = String(process.env.VAPID_SUBJECT ?? '').trim();
  return {
    publicKey,
    privateKey,
    subject: subjectRaw ? normalizeSubject(subjectRaw) : fallbackSubject(),
    source: 'env',
  };
}

async function readStoredKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const res = await query(
    `SELECT name, value FROM push_server_keys WHERE name IN ('vapid_public', 'vapid_private')`,
  );
  const rows = res.rows as { name: string; value: string }[];
  const publicKey = rows.find((r) => r.name === 'vapid_public')?.value?.trim();
  const privateKey = rows.find((r) => r.name === 'vapid_private')?.value?.trim();
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/**
 * VAPID-ключи должны переживать каждый передеплой: новые ключи делают все браузерные подписки
 * недействительными (push-сервис отвечает 403). Приоритет — переменные окружения; если их нет
 * (потерялись при пересоздании стека), берём/однократно создаём пару в БД, которая живёт в томе.
 */
export async function initVapidKeys(): Promise<VapidConfig | null> {
  const fromEnv = readEnvConfig();
  if (fromEnv) {
    resolved = fromEnv;
    return resolved;
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS push_server_keys (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    let stored = await readStoredKeys();
    if (!stored) {
      const generated = webpush.generateVAPIDKeys();
      await query(
        `INSERT INTO push_server_keys (name, value) VALUES ('vapid_public', $1), ('vapid_private', $2)
         ON CONFLICT (name) DO NOTHING`,
        [generated.publicKey, generated.privateKey],
      );
      // Другая реплика могла записать пару раньше — всегда читаем итог из БД.
      stored = await readStoredKeys();
      console.warn(
        '[push] VAPID_* не заданы в окружении: создана и сохранена пара ключей в БД (push_server_keys). ' +
          'Задайте VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY в окружении, чтобы управлять ими явно.',
      );
    }
    if (!stored) return null;
    resolved = {
      ...stored,
      subject: normalizeSubject(String(process.env.VAPID_SUBJECT ?? '').trim() || fallbackSubject()),
      source: 'db',
    };
    return resolved;
  } catch (e) {
    console.error('[push] не удалось получить VAPID-ключи из БД:', e);
    return null;
  }
}

export function getVapidConfig(): VapidConfig | null {
  return resolved ?? readEnvConfig();
}

export function getVapidPublicKeyValue(): string {
  return getVapidConfig()?.publicKey ?? '';
}
