import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';
import { query } from '../config/db';
import { sendPush } from './pushService';

export type NewJoinerMember = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
};

function displayName(member: NewJoinerMember): string {
  const fn = String(member.first_name ?? '').trim();
  const ln = String(member.last_name ?? '').trim();
  const fromParts = `${fn} ${ln}`.trim();
  if (fromParts) return fromParts;
  const name = String(member.name ?? '').trim();
  return name || 'Новый участник';
}

/** Активные участники с push-подпиской, кроме самого новичка. */
export async function getActiveMemberIdsToNotifyAboutJoiner(
  newMemberId: number,
): Promise<number[]> {
  const result = await query(
    `SELECT m.id
     FROM members m
     WHERE m.is_active = TRUE
       AND COALESCE(NULLIF(TRIM(m.registration_status), ''), 'active') = 'active'
       AND m.id <> $1
       AND (
         EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.member_id = m.id)
         OR EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.member_id = m.id)
       )`,
    [newMemberId],
  );
  return (result.rows as { id: number }[])
    .map((r) => Number(r.id))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function buildMemberJoinedPushCopy(member: NewJoinerMember): {
  title: string;
  body: string;
  draftConversationId: string;
  url: string;
} {
  const name = displayName(member);
  const draftConversationId = `draft:${member.id}`;
  return {
    title: 'Новый участник',
    body: `${name} теперь в приложении. Напишите ему!`,
    draftConversationId,
    url: resolveMessengerConversationDeepLink(draftConversationId),
  };
}

/**
 * После одобрения регистрации: пуш всем активным участникам —
 * «Имя Фамилия теперь в приложении. Напишите ему!» → открывает черновик ЛС.
 */
export async function notifyMembersAboutNewJoiner(member: NewJoinerMember): Promise<void> {
  const memberId = Number(member.id);
  if (!Number.isFinite(memberId) || memberId <= 0) return;

  const { title, body, draftConversationId, url } = buildMemberJoinedPushCopy(member);
  const recipients = await getActiveMemberIdsToNotifyAboutJoiner(memberId);
  if (recipients.length === 0) return;

  const data: Record<string, string> = {
    url,
    conversationId: draftConversationId,
    memberId: String(memberId),
    kind: 'member_joined',
    type: 'member_joined',
    tag: `member-joined-${memberId}`,
    senderName: displayName(member),
  };

  const chunkSize = 25;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const slice = recipients.slice(i, i + chunkSize);
    await Promise.allSettled(slice.map((id) => sendPush(id, title, body, data)));
  }
}
