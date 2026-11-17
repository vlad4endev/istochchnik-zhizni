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
