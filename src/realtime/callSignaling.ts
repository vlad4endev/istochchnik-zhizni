import type { WebSocket } from 'ws';

import {
  CallsError,
  acceptCall,
  cancelCall,
  declineCall,
  endCall,
} from '../services/callsService';
import { isCallsEnabledSync } from '../services/callSettingsService';
import type { WsMessengerEvent } from '../types/messenger';

/**
 * Thin WS adapter for call lifecycle.
 * Media signaling (SDP / simple-peer) is removed — LiveKit handles media.
 * Preferred path is REST `/api/calls/*`; WS handlers remain for accept/decline/cancel/end
 * so clients that still emit those events keep working.
 */

export type CallSignalingClient = {
  ws: WebSocket;
  memberId: number;
  memberName: string;
};

type CallDeps = {
  sendToMember: (memberId: number, event: WsMessengerEvent) => void;
  isMemberOnline: (memberId: number) => boolean;
};

let deps: CallDeps | null = null;

export function initCallSignaling(d: CallDeps): void {
  deps = d;
}

function isCallsFeatureEnabled(): boolean {
  return isCallsEnabledSync();
}

/** No in-memory call map — busy state lives in PostgreSQL. */
export function handleCallMemberOffline(_memberId: number): void {
  void _memberId;
  // LiveKit + cron handle disconnects; intentional no-op for REST-managed calls.
}

function sendCallError(
  memberId: number,
  callId: string,
  error: 'busy' | 'already_in_call' | 'user_offline' | 'forbidden' | 'invalid',
): void {
  deps?.sendToMember(memberId, { type: 'call:error', callId, error });
}

function mapCallsError(
  err: CallsError,
): 'busy' | 'already_in_call' | 'user_offline' | 'forbidden' | 'invalid' {
  if (err.code === 'busy') return 'busy';
  if (err.code === 'already_in_call') return 'already_in_call';
  if (err.code === 'forbidden' || err.code === 'disabled') return 'forbidden';
  return 'invalid';
}

export async function handleCallClientMessage(
  client: CallSignalingClient,
  msg: unknown,
): Promise<void> {
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
      // Clients must use POST /api/calls — WS initiate is disabled after LiveKit migration.
      const callId = typeof m.callId === 'string' ? m.callId.trim() : 'unknown';
      sendCallError(client.memberId, callId || 'unknown', 'invalid');
      break;
    }

    case 'call:accept': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      try {
        await acceptCall(callId, client.memberId);
      } catch (err) {
        if (err instanceof CallsError) {
          sendCallError(client.memberId, callId, mapCallsError(err));
        }
      }
      break;
    }

    case 'call:reject': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      try {
        await declineCall(callId, client.memberId);
      } catch (err) {
        if (err instanceof CallsError) {
          sendCallError(client.memberId, callId, mapCallsError(err));
        }
      }
      break;
    }

    case 'call:cancel': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      try {
        await cancelCall(callId, client.memberId);
      } catch (err) {
        if (err instanceof CallsError) {
          sendCallError(client.memberId, callId, mapCallsError(err));
        }
      }
      break;
    }

    case 'call:end': {
      const callId = typeof m.callId === 'string' ? m.callId.trim() : '';
      if (!callId) return;
      try {
        await endCall(callId, client.memberId);
      } catch (err) {
        if (err instanceof CallsError) {
          sendCallError(client.memberId, callId, mapCallsError(err));
        }
      }
      break;
    }

    case 'call:signal':
    case 'call:toggle_video':
    case 'call:toggle_audio':
    case 'call:screen_share':
      // Ignored: media state is managed by LiveKit client SDK.
      break;

    default:
      break;
  }
}
