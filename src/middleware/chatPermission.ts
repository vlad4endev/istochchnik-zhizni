import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/messengerService';
import type { ParticipantRole, PermissionsJson, PermissionKey } from '../types/messenger';

type AuthReq = Request & { authUserId?: number };
type ReqWithUser = Request & { user?: { id?: number | string } };

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
  const safeBase =
    base && typeof base === 'object' && !Array.isArray(base) ? (base as PermissionsJson) : {};
  const out: Record<string, boolean> = { ...DEFAULTS, ...safeBase };
  if (override && typeof override === 'object' && !Array.isArray(override)) {
    for (const [k, v] of Object.entries(override)) {
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out as Required<Record<PermissionKey, boolean>>;
}

function superpowers(role: string) {
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

function resolveAuthUserId(req: Request): number | null {
  const fromAuth = (req as AuthReq).authUserId;
  const fromUser = (req as ReqWithUser).user?.id;
  const raw = fromAuth ?? fromUser;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function resolveConversationId(req: Request): string {
  /** Явный `conversationId` (например, подставлен из `messages.id` → чат) важнее `id`: в маршрутах вида `/messages/:id/...` параметр `id` — это сообщение, а не беседа. */
  const raw =
    req.params.conversationId ??
    req.params.id ??
    (req.body as { conversationId?: string | number } | undefined)?.conversationId ??
    '';
  return String(raw).trim();
}

/** Для `checkChatPermission` на маршрутах `/messages/:id/...`, где `:id` — id сообщения. */
export async function attachConversationFromMessageIdParam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const msgId = String(req.params.id ?? '').trim();
  if (!/^\d+$/.test(msgId)) {
    deny(res, 400, 'Invalid message id');
    return;
  }
  try {
    const convId = await svc.getMessageConversationId(msgId);
    if (!convId) {
      deny(res, 404, 'Message not found');
      return;
    }
    (req.params as Record<string, string>).conversationId = String(convId);
    next();
  } catch (e) {
    console.error('[chatPermission] attachConversationFromMessageIdParam:', e);
    deny(res, 500, 'Failed to resolve message');
  }
}

export function checkChatPermission(action: Action) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userIdEarly = resolveAuthUserId(req);
    const convIdEarly = resolveConversationId(req);
    let step = 'init';
    try {
      if (!userIdEarly) {
        return deny(res, 401, 'Unauthorized');
      }
      const userId = userIdEarly;
      const convId = convIdEarly;
      if (!convId) {
        return deny(res, 400, 'conversationId is required');
      }

      step = 'getParticipantRole';
      const role = await svc.getParticipantRole(convId, userId);
      if (!role) {
        return deny(res, 403, 'Not a member of this conversation');
      }

      step = 'getConversationMeta';
      const meta = await svc.getConversationMeta(convId);
      if (!meta) {
        return deny(res, 404, 'Conversation not found');
      }

      if (
        (action === 'send_message' || action === 'send_media') &&
        svc.isMessengerAccessRequestsChannelMetadata(meta.metadata)
      ) {
        return deny(res, 403, 'Канал только для уведомлений. Отправка сообщений недоступна.');
      }

      step = 'getParticipantChatAuthRow';
      // Load member override fields (permissions/mute) — устойчиво к старым схемам БД
      const { permissions: memberPermissions, muted_until: mutedUntil } =
        await svc.getParticipantChatAuthRow(convId, userId);

      step = 'isAppAdministrator';
      const isAppAdministrator = await svc.isMemberAppAdministrator(userId);

      step = 'mergePermissions';
      // base from chat + role superpowers (then allow override to restrict)
      const roleBase = superpowers(String(role));
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

      const permissionDeniedMessage: Partial<Record<PermissionKey, string>> = {
        can_send_messages: 'В этом чате для вас отключена отправка сообщений',
        can_send_media: 'В этом чате для вас отключена отправка медиа и файлов',
        can_add_users: 'У вас нет права добавлять участников',
        can_pin_messages: 'У вас нет права закреплять сообщения',
        can_manage_chat: 'У вас нет права управлять этим чатом',
      };

      const require = (key: PermissionKey) => {
        if (!effective[key]) {
          deny(res, 403, permissionDeniedMessage[key] ?? 'Forbidden');
          return false;
        }
        return true;
      };

      // Action rules
      if (action === 'view') {
        // membership-only; no additional checks
      } else if (action === 'send_message') {
        if (meta.type === 'channel' && role !== 'owner' && role !== 'admin') {
          return deny(res, 403, 'В канале сообщения могут отправлять только администраторы');
        }
        if (!require('can_send_messages')) return;
      } else if (action === 'send_media') {
        if (!require('can_send_media')) return;
      } else if (action === 'add_users') {
        if (!effective.can_add_users && !isAppAdministrator) {
          return deny(res, 403, 'Forbidden');
        }
      } else if (action === 'pin_messages') {
        if (!require('can_pin_messages')) return;
      } else if (action === 'manage_chat') {
        if (!effective.can_manage_chat && !isAppAdministrator) {
          return deny(res, 403, 'Forbidden');
        }
      } else if (action === 'set_admin' || action === 'set_permissions' || action === 'remove_member') {
        if (role !== 'owner' && !effective.can_manage_chat && !isAppAdministrator) {
          return deny(res, 403, 'Forbidden');
        }
      } else if (action === 'edit_message' || action === 'delete_message') {
        // handled in specific endpoints with additional checks (ownership)
        // we still require membership
      }

      step = 'done';
      req.chatAuth = { conversationId: convId, memberId: userId, role, effective, mutedUntil };
      next();
    } catch (e) {
      const errObj = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
      const rawCode = errObj?.code;
      const pgCode =
        typeof rawCode === 'string'
          ? rawCode
          : typeof rawCode === 'number'
            ? String(rawCode)
            : undefined;
      const pgDetail = typeof errObj?.detail === 'string' ? errObj.detail : undefined;
      const pgHint = typeof errObj?.hint === 'string' ? errObj.hint : undefined;
      const pgColumn = typeof errObj?.column === 'string' ? errObj.column : undefined;
      const message = e instanceof Error ? e.message : String(e);

      // SQL/runtime issues are system errors and must not be mapped to 403.
      console.error(e);
      console.error('[messenger] checkChatPermission FAILED', {
        step,
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
      res.status(500).json({ error: 'Failed to authorize chat action' });
      return;
    }
  };
}

