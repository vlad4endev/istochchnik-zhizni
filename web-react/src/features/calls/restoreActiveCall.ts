import { useAuthStore } from '../auth/authStore';

import { clearPersistedCall, loadPersistedCall } from './callPersistence';
import { fetchCall } from './callsApi';
import { useCallStore } from './callStore';

const LIVE_STATUSES = new Set(['active', 'waiting']);

/**
 * Возвращает пользователя в звонок после перезагрузки страницы
 * (мобильная ОС выгрузила вкладку, пока он отправлял ссылку-приглашение).
 * Токен LiveKit запрашивается заново окном звонка.
 */
export async function restoreActiveCall(): Promise<boolean> {
  if (useCallStore.getState().activeCall) return false;
  const saved = loadPersistedCall();
  if (!saved) return false;
  const auth = useAuthStore.getState();
  if (!auth.token?.trim()) return false;

  try {
    const call = await fetchCall(saved.callId);
    // За время запроса пользователь мог сам открыть другой звонок.
    if (useCallStore.getState().activeCall) return false;
    if (!LIVE_STATUSES.has(call.status)) {
      clearPersistedCall();
      return false;
    }
    const me = Number(auth.memberId);
    useCallStore.getState().hydrateFromPublic(call, {
      peerId: saved.peerId,
      peerName: call.title?.trim() || saved.peerName,
      peerAvatar: saved.peerAvatar,
      isInitiator: Number.isFinite(me) ? call.initiatedBy === me : saved.isInitiator,
      status: 'active',
      inviteUrl: call.inviteUrl ?? saved.inviteUrl ?? null,
      conversationId: call.accessMode === 'link' ? '' : (call.conversationId ?? saved.conversationId),
      initialMicOn: saved.initialMicOn,
      initialCamOn: saved.initialCamOn,
    });
    return true;
  } catch (e) {
    // 404/403 — звонка больше нет или доступ потерян; сеть/5xx — оставляем запись для следующей попытки.
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 403) clearPersistedCall();
    return false;
  }
}
