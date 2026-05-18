import { writeAppLog } from '../services/appLogService';

export type SessionInvalidationReason =
  | 'limit_exceeded'
  | 'password_changed'
  | 'manual_logout';

export type RefreshFailureReason = 'token_not_found' | 'already_revoked' | 'expired';

export interface SessionAuditContext {
  ip?: string;
  user_agent?: string;
  request_path?: string;
}

export function logSessionInvalidated(
  reason: SessionInvalidationReason,
  memberId: number,
  audit?: SessionAuditContext,
): void {
  void writeAppLog({
    level: 'info',
    scope: 'auth',
    event: 'auth.session_invalidated',
    message: `Сессия завершена: ${reason}`,
    user_id: memberId,
    context: {
      reason,
      ...audit,
    },
  });
}
