import * as admin from 'firebase-admin';

let initAttempted = false;

/**
 * Firebase Admin для FCM. Задайте FIREBASE_SERVICE_ACCOUNT_JSON (полный JSON ключа)
 * или стандартные учётные данные приложения (GOOGLE_APPLICATION_CREDENTIALS и т.д.).
 */
export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  if (admin.apps.length > 0) {
    return admin.messaging();
  }
  if (initAttempted) {
    return null;
  }

  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      const creds = JSON.parse(jsonRaw) as admin.ServiceAccount;
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
