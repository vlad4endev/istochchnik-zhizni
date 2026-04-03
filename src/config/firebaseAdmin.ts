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

/**
 * Firebase Admin для FCM. Задайте FIREBASE_SERVICE_ACCOUNT_JSON (полный JSON ключа)
 * или стандартные учётные данные приложения (GOOGLE_APPLICATION_CREDENTIALS и т.д.).
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

  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      const creds = JSON.parse(jsonRaw) as ServiceAccount;
      admin.initializeApp({ credential: admin.credential.cert(creds) });
      initAttempted = true;
      return admin.messaging();
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
      '[fcm] Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT_JSON or application default credentials):',
      e,
    );
    return null;
  }
}
