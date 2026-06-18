import fs from 'fs';

import type { messaging, ServiceAccount } from 'firebase-admin';

type FirebaseAdminModule = typeof import('firebase-admin');

/** Lazy require: если пакет не грузится (редкие окружения), API всё равно поднимается без FCM. */
let firebaseAdminModule: FirebaseAdminModule | null | undefined;

function loadFirebaseAdmin(): FirebaseAdminModule | null {
  if (firebaseAdminModule !== undefined) {
    return firebaseAdminModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    firebaseAdminModule = require('firebase-admin') as FirebaseAdminModule;
    return firebaseAdminModule;
  } catch (e) {
    firebaseAdminModule = null;
    console.warn(
      '[fcm] firebase-admin failed to load (FCM disabled):',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

let initAttempted = false;

function readServiceAccountFromFile(filePath: string): ServiceAccount | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    console.warn('[fcm] failed to read service account file:', filePath, e);
    return null;
  }
}

function initWithServiceAccount(
  admin: FirebaseAdminModule,
  creds: ServiceAccount,
): messaging.Messaging | null {
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  initAttempted = true;
  return admin.messaging();
}

/**
 * Firebase Admin для FCM. Варианты (по приоритету):
 * 1. FIREBASE_SERVICE_ACCOUNT_PATH — путь к JSON-файлу ключа (удобно в Docker)
 * 2. FIREBASE_SERVICE_ACCOUNT_JSON — одна строка с minified JSON (без переносов в .env)
 * 3. GOOGLE_APPLICATION_CREDENTIALS — стандартный путь к JSON (ADC)
 */
export function getFirebaseMessaging(): messaging.Messaging | null {
  const admin = loadFirebaseAdmin();
  if (!admin) {
    return null;
  }
  if (admin.apps.length > 0) {
    return admin.messaging();
  }
  if (initAttempted) {
    return null;
  }

  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (filePath && fs.existsSync(filePath)) {
    const creds = readServiceAccountFromFile(filePath);
    if (creds) {
      return initWithServiceAccount(admin, creds);
    }
  }

  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      const creds = JSON.parse(jsonRaw) as ServiceAccount;
      return initWithServiceAccount(admin, creds);
    } catch (e) {
      console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON parse/init failed:', e);
    }
  }

  try {
    admin.initializeApp();
    initAttempted = true;
    return admin.messaging();
  } catch (e) {
    initAttempted = true;
    console.warn(
      '[fcm] Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS):',
      e,
    );
    return null;
  }
}
