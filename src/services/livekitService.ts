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

/**
 * Внутренний URL Room Service.
 * В compose (bridge): http://livekit:7880 — Docker DNS.
 * host.docker.internal оставляем как есть (локальные/особые схемы).
 */
export function getLiveKitInternalUrl(): string {
  return trimEnv('LIVEKIT_URL').replace(/\/$/, '');
}

export function isLiveKitConfigured(): boolean {
  return Boolean(trimEnv('LIVEKIT_API_KEY') && trimEnv('LIVEKIT_API_SECRET') && getLiveKitInternalUrl());
}

/** Логи при старте API: явные ошибки .env (дубликаты call.*, livekit DNS). */
export function logLiveKitBootDiagnostics(): void {
  const callsOn = process.env.CALLS_ENABLED === 'true';
  const key = trimEnv('LIVEKIT_API_KEY');
  const secret = trimEnv('LIVEKIT_API_SECRET');
  const rawUrl = trimEnv('LIVEKIT_URL');
  const pub = trimEnv('LIVEKIT_PUBLIC_URL');
  const web = trimEnv('PUBLIC_WEB_ORIGIN');
  const internal = getLiveKitInternalUrl();
  const publicUrl = key && secret && internal ? getLiveKitPublicUrl() : '';

  if (!callsOn) {
    console.info('[livekit] CALLS_ENABLED is not true — call API disabled');
    return;
  }
  if (!key || !secret || !rawUrl) {
    console.error(
      '[livekit] CALLS_ENABLED=true but LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL incomplete',
    );
    return;
  }
  if (/host\.docker\.internal/i.test(rawUrl)) {
    console.warn(
      `[livekit] LIVEKIT_URL=${rawUrl} — для bridge-стека лучше http://livekit:7880`,
    );
  }
  if (/call\./i.test(pub)) {
    console.warn(
      `[livekit] LIVEKIT_PUBLIC_URL=${pub} (legacy call.*) → browser uses ${publicUrl || 'PUBLIC_WEB_ORIGIN/lk'}`,
    );
  }
  console.info(
    `[livekit] calls ready: roomService=${internal} browser=${publicUrl || '(unset)'} key=${key.slice(0, 8)}… origin=${web || '(unset)'}`,
  );
}

function originHost(url: string): string {
  try {
    return new URL(url.replace(/^ws/i, 'http')).host.toLowerCase();
  } catch {
    return '';
  }
}

function publicUrlFromWebOrigin(webOrigin: string): string | null {
  const web = webOrigin.replace(/\/$/, '');
  if (web.startsWith('https://')) return `${web.replace(/^https/, 'wss')}/lk`;
  if (web.startsWith('http://')) return `${web.replace(/^http/, 'ws')}/lk`;
  return null;
}

/** wss://call.example.ru → wss://app.example.ru/lk (отдельный call.* часто без DNS/nginx). */
function rewriteLegacyCallHost(url: string): string | null {
  try {
    const httpish = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    const u = new URL(httpish);
    const host = u.hostname.toLowerCase();
    if (!host.startsWith('call.')) return null;
    const appHost = `app.${host.slice('call.'.length)}`;
    const isSecure = /^wss:/i.test(url) || /^https:/i.test(url);
    return `${isSecure ? 'wss' : 'ws'}://${appHost}/lk`;
  } catch {
    return null;
  }
}

/**
 * URL для браузера (LiveKitRoom serverUrl).
 * Предпочитаем same-origin `/lk` на PUBLIC_WEB_ORIGIN — отдельный call.* часто не настроен.
 */
export function getLiveKitPublicUrl(): string {
  const web = trimEnv('PUBLIC_WEB_ORIGIN');
  const fromWeb = web ? publicUrlFromWebOrigin(web) : null;
  const pub = trimEnv('LIVEKIT_PUBLIC_URL').replace(/\/$/, '');

  if (pub) {
    const rewrittenCall = rewriteLegacyCallHost(pub);
    if (rewrittenCall) {
      console.warn(`[livekit] rewriting legacy LIVEKIT_PUBLIC_URL ${pub} → ${rewrittenCall}`);
      return fromWeb ?? rewrittenCall;
    }

    const internal = /livekit:|127\.0\.0\.1|localhost/i.test(pub);
    if (internal) {
      console.warn('[livekit] LIVEKIT_PUBLIC_URL looks internal, falling back to PUBLIC_WEB_ORIGIN/lk');
    } else if (fromWeb) {
      const pubHost = originHost(pub);
      const webHost = originHost(web);
      // wss://app…/lk — ок; другой хост при заданном PUBLIC_WEB_ORIGIN — берём /lk
      if (pubHost && webHost && pubHost !== webHost) {
        console.warn(
          `[livekit] LIVEKIT_PUBLIC_URL host (${pubHost}) != PUBLIC_WEB_ORIGIN (${webHost}); using ${fromWeb}`,
        );
        return fromWeb;
      }
      return pub;
    } else {
      return pub;
    }
  }

  if (fromWeb) return fromWeb;

  // Last resort — never return bare docker DNS to browsers
  const internal = getLiveKitInternalUrl();
  if (internal.startsWith('https://')) return internal.replace(/^https/, 'wss');
  if (internal.startsWith('http://')) return internal.replace(/^http/, 'ws');
  return internal;
}

function getRoomService(): RoomServiceClient {
  const url = getLiveKitInternalUrl();
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
      emptyTimeout: input.emptyTimeoutSec ?? 900,
      // Дать клиенту время на LiveKit reconnect, не считая комнату пустой.
      departureTimeout: 180,
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
