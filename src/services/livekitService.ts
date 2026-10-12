import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export type LiveKitJoinTokenInput = {
  roomName: string;
  identity: string;
  displayName: string;
  canPublish: boolean;
  canSubscribe: boolean;
  roomAdmin?: boolean;
  ttlSeconds?: number;
};

function trimEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

export function isLiveKitConfigured(): boolean {
  return Boolean(trimEnv('LIVEKIT_API_KEY') && trimEnv('LIVEKIT_API_SECRET') && trimEnv('LIVEKIT_URL'));
}

export function getLiveKitPublicUrl(): string {
  const pub = trimEnv('LIVEKIT_PUBLIC_URL');
  if (pub) {
    const cleaned = pub.replace(/\/$/, '');
    // Не отдаём клиенту docker-internal hostname
    if (!/livekit:|127\.0\.0\.1|localhost/i.test(cleaned)) {
      return cleaned;
    }
    console.warn('[livekit] LIVEKIT_PUBLIC_URL looks internal, falling back to PUBLIC_WEB_ORIGIN/lk');
  }
  const web = trimEnv('PUBLIC_WEB_ORIGIN').replace(/\/$/, '');
  if (web.startsWith('https://')) return `${web.replace(/^https/, 'wss')}/lk`;
  if (web.startsWith('http://')) return `${web.replace(/^http/, 'ws')}/lk`;
  // Last resort — never return bare docker DNS to browsers
  const internal = trimEnv('LIVEKIT_URL');
  if (internal.startsWith('https://')) return internal.replace(/^https/, 'wss');
  if (internal.startsWith('http://')) return internal.replace(/^http/, 'ws');
  return internal;
}

function getRoomService(): RoomServiceClient {
  const url = trimEnv('LIVEKIT_URL');
  const apiKey = trimEnv('LIVEKIT_API_KEY');
  const apiSecret = trimEnv('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) {
    throw new Error('livekit_not_configured');
  }
  return new RoomServiceClient(url, apiKey, apiSecret);
}

export function livekitIdentityForMember(memberId: number): string {
  return `member:${memberId}`;
}

export async function ensureLiveKitRoom(input: {
  roomName: string;
  emptyTimeoutSec?: number;
  maxParticipants?: number;
  metadata?: string;
}): Promise<void> {
  if (!isLiveKitConfigured()) {
    console.warn('[livekit] ensureLiveKitRoom skipped — not configured');
    return;
  }
  const svc = getRoomService();
  try {
    await svc.createRoom({
      name: input.roomName,
      emptyTimeout: input.emptyTimeoutSec ?? 300,
      departureTimeout: 60,
      maxParticipants: input.maxParticipants,
      metadata: input.metadata,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Idempotent: room may already exist
    if (/already exists|room exists|conflict/i.test(msg)) {
      return;
    }
    console.error('[livekit] createRoom failed:', msg);
    throw err;
  }
}

export async function endLiveKitRoom(roomName: string): Promise<void> {
  if (!isLiveKitConfigured()) return;
  try {
    const svc = getRoomService();
    await svc.deleteRoom(roomName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist/i.test(msg)) return;
    console.warn('[livekit] deleteRoom:', msg);
  }
}

export async function removeLiveKitParticipant(
  roomName: string,
  identity: string,
): Promise<void> {
  if (!isLiveKitConfigured()) return;
  try {
    const svc = getRoomService();
    await svc.removeParticipant(roomName, identity);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist/i.test(msg)) return;
    console.warn('[livekit] removeParticipant:', msg);
  }
}

export async function mintLiveKitJoinToken(input: LiveKitJoinTokenInput): Promise<{
  token: string;
  url: string;
  identity: string;
}> {
  const apiKey = trimEnv('LIVEKIT_API_KEY');
  const apiSecret = trimEnv('LIVEKIT_API_SECRET');
  if (!apiKey || !apiSecret) {
    throw new Error('livekit_not_configured');
  }
  const ttl =
    input.ttlSeconds ??
    Math.max(60, Math.min(3600, Number(process.env.CALL_TOKEN_TTL_SEC ?? 900) || 900));

  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl,
  });
  at.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: input.canPublish,
    canSubscribe: input.canSubscribe,
    canPublishData: true,
    roomAdmin: Boolean(input.roomAdmin),
  });

  const token = await at.toJwt();
  return {
    token,
    url: getLiveKitPublicUrl(),
    identity: input.identity,
  };
}
