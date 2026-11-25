import { getMemberIdsWithAnyPushSubscription } from './fcmSubscriptionService';
import { sendPush, type PushSendSummary } from './pushService';
import type { AppReleasePublic } from './appReleasesService';

/**
 * Массовое оповещение о новой сборке приложения.
 *
 * Канал доставки — те же Web Push + FCM, что и для обычных уведомлений:
 * получатели с любой активной push-подпиской. Тап по уведомлению открывает
 * главную (url '/'), где виджет/баннер обновления предлагает «Обновить».
 */

export type ReleasePushMessage = { title: string; body: string };

export type ReleaseNotifySummary = {
  /** Участники, которым пытались доставить уведомление. */
  recipients: number;
  /** Подписки, по которым была реальная попытка доставки (web + fcm). */
  attempted: number;
  /** Неудачные попытки (web + fcm). */
  failed: number;
};

/** Первая непустая строка заметок — как краткое описание обновления в пуше. */
export function buildReleasePushMessage(release: AppReleasePublic): ReleasePushMessage {
  const version =
    release.version_name.trim() ||
    (release.version_code != null ? `сборка ${release.version_code}` : '');
  const title = version ? `Обновление приложения ${version}` : 'Обновление приложения';
  const notesFirstLine =
    release.notes
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  const body = notesFirstLine || 'Нажмите, чтобы открыть приложение и обновить его.';
  return { title: title.slice(0, 64), body: body.slice(0, 178) };
}

function releasePushData(release: AppReleasePublic): Record<string, string> {
  const data: Record<string, string> = {
    type: 'app_update',
    kind: 'app_update',
    url: '/',
    tag: `app-update-${release.id}`,
    releaseId: String(release.id),
  };
  if (release.version_code != null) data.versionCode = String(release.version_code);
  return data;
}

function mergeSummary(
  acc: ReleaseNotifySummary,
  memberId: number,
  res: PushSendSummary | null,
): void {
  acc.recipients += 1;
  if (!res) {
    acc.failed += 1;
    return;
  }
  acc.attempted += res.web.attempted + res.fcm.attempted;
  acc.failed += res.web.failed + res.fcm.failed;
  void memberId;
}

/** Параллельность доставки: слишком большая — упирается в таймауты HTTP-вызовов, слишком малая — в длину запроса. */
const NOTIFY_CHUNK_SIZE = 25;

export async function notifyAllMembersAboutRelease(
  release: AppReleasePublic,
): Promise<ReleaseNotifySummary> {
  const ids = await getMemberIdsWithAnyPushSubscription();
  const { title, body } = buildReleasePushMessage(release);
  const data = releasePushData(release);
  const acc: ReleaseNotifySummary = { recipients: 0, attempted: 0, failed: 0 };

  for (let i = 0; i < ids.length; i += NOTIFY_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + NOTIFY_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map((memberId) => sendPush(memberId, title, body, data)),
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        mergeSummary(acc, chunk[idx]!, r.value);
      } else {
        console.warn('[release-notify] push failed', { memberId: chunk[idx], error: r.reason });
        acc.recipients += 1;
        acc.failed += 1;
      }
    });
  }
  return acc;
}

/** Пуш после публикации релиза не должен задерживать ответ админке — отправляем в фоне. */
export function notifyAllMembersAboutReleaseInBackground(release: AppReleasePublic): void {
  void notifyAllMembersAboutRelease(release).catch((e) => {
    console.warn('[release-notify] background notify failed', e);
  });
}
