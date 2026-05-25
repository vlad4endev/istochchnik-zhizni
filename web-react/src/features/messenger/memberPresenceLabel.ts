import type { RegistrationStatus } from '../auth/authStore';
import { formatMessengerLastSeen } from './lastSeenUtils';

export type MemberRegistrationStatus = RegistrationStatus;

export type MemberPresenceInput = {
  registration_status?: string | null;
  has_registered?: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
};

export function normalizeMemberRegistrationStatus(raw: string | null | undefined): MemberRegistrationStatus {
  const s = String(raw ?? 'active').trim().toLowerCase();
  if (s === 'pending_review' || s === 'rejected') return s;
  return 'active';
}

/** Можно добавить в групповой чат (доступ к мессенджеру одобрен). */
export function canAddMemberToGroupChat(m: MemberPresenceInput): boolean {
  return normalizeMemberRegistrationStatus(m.registration_status) === 'active';
}

/** Подзаголовок в списке поиска / добавления участников. */
export function formatMemberSearchStatusLine(m: MemberPresenceInput, nowMs = Date.now()): string {
  const reg = normalizeMemberRegistrationStatus(m.registration_status);
  if (reg === 'pending_review') return 'Ожидает одобрения регистрации';
  if (reg === 'rejected') return 'Регистрация отклонена';
  if (!m.has_registered) return 'В списке церкви · вход в приложение не оформлен';
  if (m.is_online) return 'в сети';
  return formatMessengerLastSeen(m.last_seen_at ?? null, nowMs);
}

export function memberSearchStatusTone(m: MemberPresenceInput): 'online' | 'muted' | 'warn' | 'danger' {
  const reg = normalizeMemberRegistrationStatus(m.registration_status);
  if (reg === 'rejected') return 'danger';
  if (reg === 'pending_review' || !m.has_registered) return 'warn';
  if (m.is_online) return 'online';
  return 'muted';
}
