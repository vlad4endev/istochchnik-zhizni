/**
 * Диагностика пушей (Firebase / FCM-токены / APNs VoIP).
 *
 * Локально: npm run diagnose:push -- [memberId]
 * В Docker:  docker compose exec -T api node dist/cli/diagnosePush.js [memberId]
 *
 * Без memberId показывает настройку и сколько телефонов зарегистрировано.
 * С memberId делает пробную отправку (dryRun — на телефон ничего не приходит) на его токены.
 * Токены и ключи в вывод не попадают.
 */
import admin from 'firebase-admin';

import { pool, query } from '../config/db';
import { getFirebaseMessaging } from '../config/firebaseAdmin';
import { isApnsVoipConfigured } from '../services/apnsVoipPush';
import { getFcmTokensForMember } from '../services/fcmSubscriptionService';
import { loadEnvFromDotenv } from './loadEnv';

function mask(token: string): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

async function main(): Promise<void> {
  loadEnvFromDotenv();
  const memberArg = process.argv[2]?.trim();

  const hasPath = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
  const hasJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
  console.log('[push] ключ Firebase: путь задан =', hasPath, '| JSON в переменной =', hasJson);

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.log('[push] Firebase НЕ настроен: пуши (в том числе о звонках) не отправляются.');
    console.log('       Задайте FIREBASE_SERVICE_ACCOUNT_JSON или FIREBASE_SERVICE_ACCOUNT_PATH (ключ сервисного аккаунта).');
  } else {
    const projectId = admin.app().options.projectId;
    console.log('[push] Firebase настроен, проект:', projectId ?? '(не указан)');
    console.log('       Проект должен совпадать с project_id в mobile/google-services.json (mychurch-29bce).');
  }
  console.log('[push] APNs VoIP (iPhone, CallKit) настроен:', isApnsVoipConfigured());

  if (!pool) {
    console.log('[push] DATABASE_URL не задан — токены проверить нельзя.');
    return;
  }
  const stats = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(DISTINCT member_id)::int AS members,
       COUNT(*) FILTER (WHERE device_id LIKE 'rn-android-%')::int AS rn_android,
       COUNT(*) FILTER (WHERE device_id LIKE 'rn-ios-%')::int AS rn_ios,
       COUNT(*) FILTER (WHERE device_id NOT LIKE 'rn-%')::int AS other
     FROM user_subscriptions`,
  );
  console.log('[push] зарегистрированные телефоны:', stats.rows[0]);

  if (!memberArg) return;
  const memberId = Number(memberArg);
  if (!Number.isInteger(memberId)) throw new Error('memberId должен быть числом');
  const tokens = await getFcmTokensForMember(memberId);
  console.log(`[push] у участника ${memberId} токенов: ${tokens.length}`);
  if (tokens.length === 0) {
    console.log('       Телефон не зарегистрирован: войдите в приложение заново и разрешите уведомления.');
    return;
  }
  if (!messaging) return;
  for (const token of tokens) {
    try {
      await messaging.send({ token, data: { type: 'diagnose' } }, true);
      console.log('       ', mask(token), '— токен принят Firebase');
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : String(e));
      console.log('       ', mask(token), '— ОШИБКА:', code);
    }
  }
}

main()
  .catch((e) => {
    console.error('[push] ошибка диагностики:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void pool?.end());
