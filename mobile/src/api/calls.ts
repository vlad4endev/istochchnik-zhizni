import { apiClient } from './client';

export type CallMediaType = 'audio' | 'video';

export type CreatedCall = {
  id: string;
  title: string | null;
  inviteUrl: string | null;
  mediaType: CallMediaType;
};

type CallPayload = {
  id?: unknown;
  title?: unknown;
  inviteUrl?: unknown;
  mediaType?: unknown;
};

function toCreatedCall(raw: CallPayload | undefined, fallbackType: CallMediaType): CreatedCall {
  const id = typeof raw?.id === 'string' ? raw.id : '';
  if (!id) throw new Error('Сервер не вернул созвон');
  return {
    id,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    inviteUrl: typeof raw?.inviteUrl === 'string' && raw.inviteUrl.trim() ? raw.inviteUrl : null,
    mediaType: raw?.mediaType === 'audio' ? 'audio' : fallbackType,
  };
}

/** Встреча по ссылке без отдельного чата (как «Видеовстреча» в вебе). */
export async function createStandaloneMeeting(input: {
  mediaType: CallMediaType;
  title?: string;
}): Promise<CreatedCall> {
  const { data } = await apiClient.post<{ call: CallPayload }>('/api/calls', {
    type: 'group',
    mediaType: input.mediaType,
    accessMode: 'link',
    standalone: true,
    title: input.title?.trim() || undefined,
  });
  return toCreatedCall(data.call, input.mediaType);
}

/** Групповой созвон в существующем чате; участники входят по ссылке. */
export async function createChatMeeting(input: {
  conversationId: string;
  mediaType: CallMediaType;
  title?: string;
}): Promise<CreatedCall> {
  const { data } = await apiClient.post<{ call: CallPayload }>('/api/calls', {
    type: 'group',
    conversationId: input.conversationId,
    mediaType: input.mediaType,
    accessMode: 'link',
    title: input.title?.trim() || undefined,
  });
  return toCreatedCall(data.call, input.mediaType);
}

/** Текст для чата и «Поделиться»: название и ссылка. */
export function formatInviteText(title: string, url: string): string {
  const name = title.trim() || 'Встреча';
  return url.trim() ? `${name}\n${url.trim()}` : name;
}

/* ───────── Участие в звонке ───────── */

export type CallTokenResponse = {
  token: string;
  /** Адрес LiveKit-сервера (wss://…). */
  url: string;
  identity: string;
  call: { id: string; status: string; title?: string | null; mediaType?: CallMediaType };
};

function errText(e: unknown, fallback: string): string {
  const ax = e as { message?: string };
  return ax?.message?.trim() || fallback;
}

/** Токен входа в комнату для участника (создатель встречи, принявший звонок и т. п.). */
export async function fetchCallToken(callId: string): Promise<CallTokenResponse> {
  try {
    const { data } = await apiClient.post<CallTokenResponse>(`/api/calls/${encodeURIComponent(callId)}/token`);
    return data;
  } catch (e) {
    throw new Error(errText(e, 'Не удалось получить доступ к комнате'));
  }
}

/** Вход по приглашению из ссылки. */
export async function joinByInvite(inviteToken: string): Promise<CallTokenResponse> {
  try {
    const { data } = await apiClient.post<CallTokenResponse>(
      `/api/call-invitations/${encodeURIComponent(inviteToken)}/join`,
    );
    return data;
  } catch (e) {
    throw new Error(errText(e, 'Не удалось подключиться по приглашению'));
  }
}

export type InvitePreview = {
  valid: boolean;
  reason?: string;
  title?: string | null;
  mediaType?: CallMediaType;
  canJoin: boolean;
  callId?: string;
};

export async function previewInvite(inviteToken: string): Promise<InvitePreview> {
  const { data } = await apiClient.get<Partial<InvitePreview>>(
    `/api/call-invitations/${encodeURIComponent(inviteToken)}`,
  );
  return {
    valid: data?.valid === true,
    reason: data?.reason,
    title: data?.title ?? null,
    mediaType: data?.mediaType === 'audio' ? 'audio' : 'video',
    canJoin: data?.canJoin !== false,
    callId: data?.callId,
  };
}

export async function acceptCall(callId: string): Promise<void> {
  try {
    await apiClient.post(`/api/calls/${encodeURIComponent(callId)}/accept`);
  } catch (e) {
    throw new Error(errText(e, 'Не удалось принять звонок'));
  }
}

export async function declineCall(callId: string): Promise<void> {
  try {
    await apiClient.post(`/api/calls/${encodeURIComponent(callId)}/decline`);
  } catch (e) {
    throw new Error(errText(e, 'Не удалось отклонить звонок'));
  }
}

/** Отменить свой исходящий звонок, пока собеседник не ответил. */
export async function cancelCall(callId: string): Promise<void> {
  try {
    await apiClient.post(`/api/calls/${encodeURIComponent(callId)}/cancel`);
  } catch (e) {
    throw new Error(errText(e, 'Не удалось отменить звонок'));
  }
}

/** Выйти из звонка; `endForAll` — завершить встречу для всех (для организатора). */
export async function endCall(callId: string, opts?: { endForAll?: boolean }): Promise<void> {
  try {
    await apiClient.post(`/api/calls/${encodeURIComponent(callId)}/end`, opts?.endForAll ? { endForAll: true } : {});
  } catch (e) {
    throw new Error(errText(e, 'Не удалось завершить звонок'));
  }
}

/** Личный звонок 1:1: у собеседника «звонит», пока он не ответит. */
export async function createDirectCall(input: {
  conversationId: string;
  recipientId: number;
  mediaType: CallMediaType;
}): Promise<CreatedCall> {
  try {
    const { data } = await apiClient.post<{ call: CallPayload }>('/api/calls', {
      type: 'direct',
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      mediaType: input.mediaType,
    });
    return toCreatedCall(data.call, input.mediaType);
  } catch (e) {
    throw new Error(errText(e, 'Не удалось начать звонок'));
  }
}

/** Токен приглашения из ссылки вида …/call/join/<токен> (или сам токен). */
export function parseInviteToken(urlOrToken: string | null | undefined): string | null {
  const raw = String(urlOrToken ?? '').trim();
  if (!raw) return null;
  const m = /\/call\/join\/([A-Za-z0-9_-]{8,})/.exec(raw);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{16,}$/.test(raw) ? raw : null;
}

/** Первая ссылка-приглашение в тексте сообщения (для кнопки «Присоединиться»). */
export function findInviteInText(
  text: string | null | undefined,
): { token: string; title: string; url: string } | null {
  const body = String(text ?? '');
  const m = /https?:\/\/[^\s]*\/call\/join\/([A-Za-z0-9_-]{8,})/.exec(body);
  if (!m) return null;
  const title = body.slice(0, m.index).trim().split('\n')[0]?.trim() ?? '';
  return { token: m[1]!, title: title || 'Встреча', url: m[0] };
}

/** Статус звонка на сервере (`ringing`, `active`, `ended`, …) или null, если звонок не найден. */
export async function fetchCallStatus(callId: string): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ call?: { status?: string } }>(`/api/calls/${encodeURIComponent(callId)}`);
    return typeof data?.call?.status === 'string' ? data.call.status : null;
  } catch {
    return null;
  }
}
