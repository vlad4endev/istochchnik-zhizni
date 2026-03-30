import type { Request, Response, NextFunction } from 'express';
import { query as dbQuery } from '../config/db';
import * as svc from '../services/messengerService';
import type { ParticipantRole, PermissionsJson, PermissionKey } from '../types/messenger';

type AuthReq = Request & { authUserId?: number };

type Action =
  | 'view'
  | 'send_message'
  | 'send_media'
  | 'add_users'
  | 'pin_messages'
  | 'manage_chat'
  | 'edit_message'
  | 'delete_message'
  | 'remove_member'
  | 'set_admin'
  | 'set_permissions';

export type ChatAuthContext = {
  conversationId: string;
  memberId: number;
  role: ParticipantRole;
  effective: Required<Record<PermissionKey, boolean>>;
  mutedUntil: string | null;
};

declare module 'express-serve-static-core' {
  interface Request {
    chatAuth?: ChatAuthContext;
  }
}

const DEFAULTS: Required<Record<PermissionKey, boolean>> = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: false,
  can_pin_messages: false,
  can_manage_chat: false,
};

function mergePermissions(base: PermissionsJson | undefined, override: PermissionsJson | undefined) {
  const out: any = { ...DEFAULTS, ...(base ?? {}) };
  if (override) {
    for (const [k, v] of Object.entries(override)) {
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out as Required<Record<PermissionKey, boolean>>;
}

function superpowers(role: ParticipantRole) {
  if (role === 'owner') {
    return {
      can_send_messages: true,
      can_send_media: true,
      can_add_users: true,
      can_pin_messages: true,
      can_manage_chat: true,
    } satisfies Required<Record<PermissionKey, boolean>>;
  }
  if (role === 'admin') {
    return {
      can_send_messages: true,
      can_send_media: true,
      can_add_users: true,
      can_pin_messages: true,
      can_manage_chat: true,
    } satisfies Required<Record<PermissionKey, boolean>>;
  }
  return null;
}

function deny(res: Response, code: number, error: string) {
  res.status(code).json({ error });
}

export function checkChatPermission(action: Action) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userIdEarly = (req as AuthReq).authUserId;
    const convIdEarly = String(
      req.params.id ?? req.params.conversationId ?? (req.body as { conversationId?: string } | undefined)?.conversationId ?? '',
    );
    try {
      const userId = userIdEarly;
      if (!userId) {
        return deny(res, 401, 'Unauthorized');
      }
      const convId = convIdEarly;
      if (!convId) {
        return deny(res, 400, 'conversationId is required');
      }

      const role = await svc.getParticipantRole(convId, userId);
      if (!role) {
        return deny(res, 403, 'Not a member of this conversation');
      }

      const meta = await svc.getConversationMeta(convId);
      if (!meta) {
        return deny(res, 404, 'Conversation not found');
      }

      // Load member override fields (permissions/mute)
      const memberRowRes = await dbQuery(
        `SELECT permissions, muted_until FROM conversation_participants
           WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
           LIMIT 1`,
        [convId, userId],
      );
      const memberRow = memberRowRes.rows[0] ?? null;

      const mutedUntil = memberRow?.muted_until ?? null;
      const memberPermissions = (memberRow?.permissions ?? {}) as PermissionsJson;

      // base from chat + role superpowers (then allow override to restrict)
      const roleBase = superpowers(role);
      const base = roleBase ?? (meta.default_permissions ?? {});
      const effective = mergePermissions(base, memberPermissions);

      // Common mute restriction
      if (
        mutedUntil &&
        (action === 'send_message' || action === 'send_media') &&
        new Date(mutedUntil).getTime() > Date.now()
      ) {
        return deny(res, 403, 'Muted');
      }

      const require = (key: PermissionKey) => {
        if (!effective[key]) {
          deny(res, 403, 'Forbidden');
          return false;
        }
        return true;
      };

      // Action rules
      if (action === 'view') {
        // membership-only; no additional checks
      } else if (action === 'send_message') {
        if (meta.type === 'channel' && role !== 'owner' && role !== 'admin') {
          return deny(res, 403, 'Only admins can post in channels');
        }
        if (!require('can_send_messages')) return;
      } else if (action === 'send_media') {
        if (!require('can_send_media')) return;
      } else if (action === 'add_users') {
        if (!require('can_add_users')) return;
      } else if (action === 'pin_messages') {
        if (!require('can_pin_messages')) return;
      } else if (action === 'manage_chat') {
        if (!require('can_manage_chat')) return;
      } else if (action === 'set_admin' || action === 'set_permissions' || action === 'remove_member') {
        if (role !== 'owner' && !effective.can_manage_chat) {
          return deny(res, 403, 'Forbidden');
        }
      } else if (action === 'edit_message' || action === 'delete_message') {
        // handled in specific endpoints with additional checks (ownership)
        // we still require membership
      }

      req.chatAuth = { conversationId: convId, memberId: userId, role, effective, mutedUntil };
      next();
    } catch (e) {
      const errObj = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
      const pgCode = typeof errObj?.code === 'string' ? errObj.code : undefined;
      const pgDetail = typeof errObj?.detail === 'string' ? errObj.detail : undefined;
      const pgHint = typeof errObj?.hint === 'string' ? errObj.hint : undefined;
      const pgColumn = typeof errObj?.column === 'string' ? errObj.column : undefined;
      const message = e instanceof Error ? e.message : String(e);

      console.error('[messenger] checkChatPermission FAILED', {
        action,
        method: req.method,
        path: req.path,
        originalUrl: req.originalUrl,
        routeParamId: req.params.id,
        routeParamConversationId: req.params.conversationId,
        conversationIdUsed: convIdEarly || '(empty)',
        userId: userIdEarly ?? '(missing — should have been 401)',
        hasAuthHeader: Boolean(req.headers.authorization),
        authHeaderScheme: req.headers.authorization?.split(' ')[0]?.toLowerCase() ?? null,
        bodyKeys:
          req.body && typeof req.body === 'object' && !Array.isArray(req.body)
            ? Object.keys(req.body as object)
            : [],
        pgCode,
        pgDetail,
        pgHint,
        pgColumn,
        message,
      });
      if (e instanceof Error && e.stack) {
        console.error('[messenger] checkChatPermission stack:', e.stack);
      }
      return deny(res, 500, 'Failed to authorize chat action');
    }
  };
}

