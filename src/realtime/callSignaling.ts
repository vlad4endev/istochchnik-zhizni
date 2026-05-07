import type { WebSocket } from 'ws';

import { query } from '../config/db';
import {
  getConversationType,
  isMemberInConversation,
} from '../services/messengerService';
import type { WsMessengerEvent } from '../types/messenger';

export type CallSignalingClient = {
  ws: WebSocket;
  memberId: number;
  memberName: string;
};

type CallType = 'audio' | 'video';

type ActiveCall = {
  callerId: number;
  receiverId: number;
  conversationId: string;
  callType: CallType;
  status: 'ringing' | 'active';
  startTime: number | null;
  ringTimer: ReturnType<typeof setTimeout>;
};

const activeCalls = new Map<string, ActiveCall>();

type CallDeps = {
  sendToMember: (memberId: number, event: WsMessengerEvent) => void;
  isMemberOnline: (memberId: number) => boolean;
};

let deps: CallDeps | null = null;

export function initCallSignaling(d: CallDeps): void {
  deps = d;
}

function isCallsFeatureEnabled(): boolean {
  return process.env.CALLS_ENABLED === 'true';
}

/** Завершает все звонки пользователя, когда он полностью офлайн (все сокеты закрыты). */
export function handleCallMemberOffline(memberId: number): void {
  if (!deps) return;
  for (const [callId, call] of activeCalls) {
    if (call.callerId !== memberId && call.receiverId !== memberId) continue;
    clearRingTimer(call);
    activeCalls.delete(callId);
    const peerId = call.callerId === memberId ? call.receiverId : call.callerId;
    deps.sendToMember(peerId, { type: 'call:ended', callId, reason: 'peer_disconnected' });
  }
}

function clearRingTimer(call: ActiveCall): void {
  clearTimeout(call.ringTimer);
}

async function isMemberAppAdministrator(memberId: number): Promise<boolean> {
  try {
    const res = await query(
      `SELECT
         LOWER(TRIM(COALESCE(app_role, ''))) = 'admin' AS primary_admin,
         EXISTS (
           SELECT 1
           FROM unnest(COALESCE(app_roles, ARRAY[]::text[])) AS ar(role)
           WHERE LOWER(TRIM(role)) = 'admin'
         ) AS roles_admin
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = res.rows[0] as { primary_admin?: boolean; roles_admin?: boolean } | undefined;
    return Boolean(row?.primary_admin || row?.roles_admin);
  } catch {
    return false;
  }
}

async function verifyPrivatePairInConversation(
  conversationId: string,
  a: number,
  b: number,
): Promise<boolean> {
  const convType = await getConversationType(conversationId);
  if (convType !== 'private') return false;
  const [okA, okB] = await Promise.all([
    isMemberInConversation(conversationId, a),
    isMemberInConversation(conversationId, b),
  ]);
  if (!okA || !okB) return false;
  try {
    const res = await query(
      `SELECT COUNT(*)::int AS c FROM conversation_participants
       WHERE conversation_id = $1::bigint AND left_at IS NULL`,
      [conversationId],
    );
    const c = res.rows[0]?.c;
    return c === 2;
  } catch {
    return false;
  }
}

function isUserBusy(userId: number): boolean {
  for (const call of activeCalls.values()) {
    if (
      (call.callerId === userId || call.receiverId === userId) &&
      (call.status === 'ringing' || call.status === 'active')
    ) {
      return true;
    }
  }
  return false;
}

async function loadMemberCallProfile(
  memberId: number,
): Promise<{ name: string; avatarUrl: string | null }> {
  try {
    const res = await query(
      `SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') AS full_name,
              avatar_url
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = res.rows[0] as { full_name?: string; avatar_url?: string | null } | undefined;
    const full = String(row?.full_name ?? '').trim();
    return {
      name: full || `User ${memberId}`,
      avatarUrl: row?.avatar_url != null ? String(row.avatar_url) : null,
    };
  } catch {
    return { name: `User ${memberId}`, avatarUrl: null };
  }
}

function pickCallType(raw: unknown): CallType | null {
  if (raw === 'audio' || raw === 'video') return raw;
  return null;
}

function sendCallError(
  memberId: number,
  callId: string,
  error: 'busy' | 'already_in_call' | 'user_offline' | 'forbidden' | 'invalid',
): void {
  deps?.sendToMember(memberId, { type: 'call:error', callId, error });
}

export async function handleCallClientMessage(client: CallSignalingClient, msg: unknown): Promise<void> {
  if (!deps) return;
  if (!msg || typeof msg !== 'object') return;
  const m = msg as Record<string, unknown>;
  const t = m.type;
  if (typeof t !== 'string' || !t.startsWith('call:')) return;
  if (!isCallsFeatureEnabled()) {
    if (t === 'call:initiate') {
      const callId = typeof m.callId === 'string' && m.callId.trim() ? m.callId.trim() : 'disabled';
      sendCallError(client.memberId, callId, 'forbidden');
    }
    return;
  }

  switch (t) {
    case 'call:initiate': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      const conversationId =
        typeof m.conversationId === 'string' ? m.conversationId.trim() : '';
      const receiverRaw = m.receiverId;
      const receiverId = typeof receiverRaw === 'number' ? receiverRaw : Number(receiverRaw);
      const callType = pickCallType(m.callType);
      const callerId = client.memberId;

      if (!callId || !conversationId || !Number.isFinite(receiverId) || !callType) {
        sendCallError(callerId, callId || 'unknown', 'invalid');
        return;
      }

      const allowed = await verifyPrivatePairInConversation(conversationId, callerId, receiverId);
      if (!allowed) {
        sendCallError(callerId, callId, 'forbidden');
        return;
      }

      const receiverIsAdmin = await isMemberAppAdministrator(receiverId);
      if (!receiverIsAdmin) {
        sendCallError(callerId, callId, 'forbidden');
        return;
      }

      if (receiverId === callerId) {
        sendCallError(callerId, callId, 'invalid');
        return;
      }

      if (isUserBusy(receiverId)) {
        sendCallError(callerId, callId, 'busy');
        return;
      }
      if (isUserBusy(callerId)) {
        sendCallError(callerId, callId, 'already_in_call');
        return;
      }

      if (!deps.isMemberOnline(receiverId)) {
        sendCallError(callerId, callId, 'user_offline');
        return;
      }

      if (activeCalls.has(callId)) {
        sendCallError(callerId, callId, 'invalid');
        return;
      }

      const ringTimer = setTimeout(() => {
        const d = deps;
        if (!d) return;
        const call = activeCalls.get(callId);
        if (call?.status === 'ringing') {
          clearRingTimer(call);
          activeCalls.delete(callId);
          const ended: WsMessengerEvent = { type: 'call:ended', callId, reason: 'no_answer' };
          d.sendToMember(call.callerId, ended);
          d.sendToMember(call.receiverId, ended);
        }
      }, 60_000);

      activeCalls.set(callId, {
        callerId,
        receiverId,
        conversationId,
        callType,
        status: 'ringing',
        startTime: null,
        ringTimer,
      });

      const profile = await loadMemberCallProfile(callerId);
      deps.sendToMember(receiverId, {
        type: 'call:incoming',
        callId,
        callerId,
        conversationId,
        callType,
        callerName: profile.name,
        callerAvatar: profile.avatarUrl,
      });
      break;
    }

    case 'call:accept': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      const call = activeCalls.get(callId);
      if (!call || call.receiverId !== client.memberId) return;
      if (call.status !== 'ringing') return;
      clearRingTimer(call);
      call.status = 'active';
      call.startTime = Date.now();
      deps.sendToMember(call.callerId, { type: 'call:accepted', callId });
      break;
    }

    case 'call:reject': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      const call = activeCalls.get(callId);
      if (!call || call.receiverId !== client.memberId) return;
      clearRingTimer(call);
      activeCalls.delete(callId);
      const reason = typeof m.reason === 'string' ? m.reason : undefined;
      deps.sendToMember(call.callerId, { type: 'call:rejected', callId, reason });
      break;
    }

    case 'call:cancel': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      const call = activeCalls.get(callId);
      if (!call || call.callerId !== client.memberId) return;
      if (call.status !== 'ringing') return;
      clearRingTimer(call);
      activeCalls.delete(callId);
      deps.sendToMember(call.receiverId, { type: 'call:cancelled', callId });
      break;
    }

    case 'call:end': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.callerId !== client.memberId && call.receiverId !== client.memberId) return;
      const duration =
        call.startTime != null ? Math.floor((Date.now() - call.startTime) / 1000) : 0;
      clearRingTimer(call);
      activeCalls.delete(callId);
      const targetId = client.memberId === call.callerId ? call.receiverId : call.callerId;
      deps.sendToMember(targetId, { type: 'call:ended', callId, duration });
      break;
    }

    case 'call:signal': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId || !('data' in m)) return;
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.callerId !== client.memberId && call.receiverId !== client.memberId) return;
      /** Сигнализация разрешена в ringing (ранний ICE) и active */
      const targetId = client.memberId === call.callerId ? call.receiverId : call.callerId;
      deps.sendToMember(targetId, {
        type: 'call:signal',
        callId,
        data: m.data,
      });
      break;
    }

    case 'call:toggle_video':
    case 'call:toggle_audio':
    case 'call:screen_share': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      const call = activeCalls.get(callId);
      if (!call || call.status !== 'active') return;
      if (call.callerId !== client.memberId && call.receiverId !== client.memberId) return;
      const targetId = client.memberId === call.callerId ? call.receiverId : call.callerId;
      const enabled = Boolean(m.enabled);
      if (t === 'call:toggle_video') {
        deps.sendToMember(targetId, {
          type: 'call:peer_video',
          callId,
          userId: client.memberId,
          enabled,
        });
      } else if (t === 'call:toggle_audio') {
        deps.sendToMember(targetId, {
          type: 'call:peer_audio',
          callId,
          userId: client.memberId,
          enabled,
        });
      } else {
        deps.sendToMember(targetId, { type: 'call:peer_screen', callId, enabled });
      }
      break;
    }

    default:
      break;
  }
}
