import { apiClient } from '../../lib/apiClient';

export type CallMediaType = 'audio' | 'video';
export type CallType = 'direct' | 'group';
export type CallStatus =
  | 'ringing'
  | 'waiting'
  | 'active'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'failed';

export type CallPublic = {
  id: string;
  type: CallType;
  mediaType: CallMediaType;
  status: CallStatus;
  /** null for standalone Telemost-style meetings (no chat) */
  conversationId: string | null;
  /** Пользовательское название встречи */
  title?: string | null;
  initiatedBy: number;
  accessMode: 'closed' | 'link';
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: string | null;
  inviteUrl?: string | null;
  participants?: Array<{
    userId: number;
    role: string;
    status: string;
    name?: string;
    avatarUrl?: string | null;
  }>;
};

export type CallTokenResponse = {
  token: string;
  url: string;
  identity: string;
  call: CallPublic;
};

type ApiErrorBody = { error?: string; code?: string };

function errMessage(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: ApiErrorBody }; message?: string };
  return ax.response?.data?.error || ax.message || fallback;
}

export async function createDirectCall(input: {
  conversationId: string;
  recipientId: number;
  mediaType: CallMediaType;
}): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>('/api/calls', {
      type: 'direct',
      conversationId: input.conversationId,
      recipientId: input.recipientId,
      mediaType: input.mediaType,
    });
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось начать звонок'));
  }
}

export async function createGroupCall(input: {
  conversationId: string;
  mediaType: CallMediaType;
  accessMode?: 'closed' | 'link';
  title?: string;
}): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>('/api/calls', {
      type: 'group',
      conversationId: input.conversationId,
      mediaType: input.mediaType,
      accessMode: input.accessMode ?? 'closed',
      title: input.title?.trim() || undefined,
    });
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось начать конференцию'));
  }
}

/** Standalone link meeting — no chat/group created (Телемост). */
export async function createStandaloneCall(input: {
  mediaType: CallMediaType;
  title?: string;
}): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>('/api/calls', {
      type: 'group',
      mediaType: input.mediaType,
      accessMode: 'link',
      standalone: true,
      title: input.title?.trim() || undefined,
    });
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось создать встречу'));
  }
}

export async function fetchCall(callId: string): Promise<CallPublic> {
  try {
    const { data } = await apiClient.get<{ call: CallPublic }>(`/api/calls/${callId}`);
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Звонок не найден'));
  }
}

export async function acceptCall(callId: string): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>(`/api/calls/${callId}/accept`);
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось принять звонок'));
  }
}

export async function declineCall(callId: string): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>(`/api/calls/${callId}/decline`);
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось отклонить звонок'));
  }
}

export async function cancelCall(callId: string): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>(`/api/calls/${callId}/cancel`);
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось отменить звонок'));
  }
}

export async function endCall(callId: string): Promise<CallPublic> {
  try {
    const { data } = await apiClient.post<{ call: CallPublic }>(`/api/calls/${callId}/end`);
    return data.call;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось завершить звонок'));
  }
}

export async function fetchCallToken(callId: string): Promise<CallTokenResponse> {
  try {
    const { data } = await apiClient.post<CallTokenResponse>(`/api/calls/${callId}/token`);
    return data;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось получить доступ к комнате'));
  }
}

export async function previewInvitation(token: string): Promise<{
  valid: boolean;
  reason?: string;
  mediaType?: CallMediaType;
  callStatus?: CallStatus;
  conversationTitle?: string | null;
  participantCount?: number;
  requiresAuth: boolean;
  canJoin: boolean;
  callId?: string;
}> {
  const { data } = await apiClient.get(`/api/call-invitations/${encodeURIComponent(token)}`);
  return data;
}

export async function joinInvitation(token: string): Promise<CallTokenResponse> {
  try {
    const { data } = await apiClient.post<CallTokenResponse>(
      `/api/call-invitations/${encodeURIComponent(token)}/join`,
    );
    return data;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось подключиться по приглашению'));
  }
}

export async function createCallInvitation(callId: string): Promise<{
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
}> {
  try {
    const { data } = await apiClient.post(`/api/calls/${callId}/invitations`, {});
    return data;
  } catch (e) {
    throw new Error(errMessage(e, 'Не удалось создать приглашение'));
  }
}

export function mapDeviceError(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (name === 'NotAllowedError' || /permission|denied|NotAllowed/i.test(msg)) {
    return 'Нет доступа к микрофону или камере. Разрешите доступ в настройках браузера.';
  }
  if (name === 'NotFoundError' || /Device not found|NotFoundError/i.test(msg)) {
    return 'Устройство не найдено. Проверьте подключение микрофона или камеры.';
  }
  if (name === 'NotReadableError' || /in use|NotReadable/i.test(msg)) {
    return 'Устройство занято другим приложением.';
  }
  if (/invalid authorization|invalid token|jwt|signature/i.test(msg)) {
    return 'Нет доступа к комнате звонка. Обновите страницу или пересоздайте встречу.';
  }
  if (
    /websocket|timed?\s*out|connection.*(fail|refus|reset|closed)|network|failed to fetch|503|502|504|ECONN|ENOTFOUND|server.*unreachable|could not establish|pc connection|ice/i.test(
      msg,
    )
  ) {
    return 'Не удалось связаться с сервером звонков. Проверьте интернет и нажмите «Повторить».';
  }
  if (/room|token|unauthorized|forbidden|401|403/i.test(msg)) {
    return 'Нет доступа к комнате звонка. Попробуйте перезвонить.';
  }
  return msg.trim() ? msg : 'Не удалось подключиться к звонку.';
}
