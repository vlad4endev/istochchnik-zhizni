import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export type LiveKitJoinTokenInput = {
  roomName: string;
  identity: string;
  displayName: string;
  /** Публичный путь/URL аватара — в metadata участника для UI сетки. */
  avatarUrl?: string | null;
  canPublish: boolean;
  canSubscribe: boolean;
  roomAdmin?: boolean;
  ttlSeconds?: number;
};

/** Запомненный рабочий Room Service URL после успешного createRoom/listRooms. */
let preferredInternalUrl: string | null = null;

function trimEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

/**
 * Host-network LiveKit слушает на хосте :7880.
 * Docker DNS `livekit` не резолвится при network_mode:host — подменяем на gateway.
 */
export function normalizeLiveKitInternalUrl(raw: string): string {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host === 'livekit' || host === 'livekit.internal') {
      u.hostname = 'host.docker.internal';
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    /* keep as-is */
  }
  return trimmed;
}

/**
 * Внутренний URL Room Service (host-network LiveKit → http://host.docker.internal:7880).
 */
export function getLiveKitInternalUrl(): string {
  return normalizeLiveKitInternalUrl(trimEnv('LIVEKIT_URL'));
}

/** Кандидаты Room Service: preferred → env → docker gateway → loopback. */
export function getLiveKitInternalUrlCandidates(): string[] {
  const primary = getLiveKitInternalUrl();
  const list = [
    preferredInternalUrl,
    primary,
    'http://host.docker.internal:7880',
    'http://172.17.0.1:7880',
    'http://127.0.0.1:7880',
  ]
    .map((u) => normalizeLiveKitInternalUrl(u ?? ''))
    .filter(Boolean);
  return [...new Set(list)];
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
  if (/\/\/livekit[:/]/i.test(rawUrl) && internal !== rawUrl.replace(/\/$/, '')) {
    console.warn(`[livekit] LIVEKIT_URL=${rawUrl} → normalized ${internal}`);
  }
  if (/call\./i.test(pub)) {
    console.warn(
      `[livekit] LIVEKIT_PUBLIC_URL=${pub} (legacy call.*) → browser uses ${publicUrl || 'PUBLIC_WEB_ORIGIN/lk'}`,
    );
  }
  console.info(
    `[livekit] calls ready: roomService=${internal} candidates=${getLiveKitInternalUrlCandidates().join(',')} browser=${publicUrl || '(unset)'} key=${key.slice(0, 8)}… origin=${web || '(unset)'}`,
  );

  void probeLiveKitRoomService()
    .then((r) => {
      if (r.ok) {
        console.info(`[livekit] roomService probe OK via ${r.url}`);
      } else {
        console.error(`[livekit] roomService probe FAIL: ${r.error}`);
      }
    })
    .catch((e) => {
      console.error('[livekit] roomService probe error:', e instanceof Error ? e.message : e);
    });
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
  // Trailing slash: LiveKit client appends rtc/… via pathname join.
  if (web.startsWith('https://')) return `${web.replace(/^https/, 'wss')}/lk/`;
  if (web.startsWith('http://')) return `${web.replace(/^http/, 'ws')}/lk/`;
  return null;
}

/** Normalize browser LiveKit URL to end with `/` (…/lk/). */
export function ensureLiveKitPublicUrlPath(url: string): string {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
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
    return `${isSecure ? 'wss' : 'ws'}://${appHost}/lk/`;
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

  let resolved = '';
  if (pub) {
    const rewrittenCall = rewriteLegacyCallHost(pub);
    if (rewrittenCall) {
      console.warn(`[livekit] rewriting legacy LIVEKIT_PUBLIC_URL ${pub} → ${rewrittenCall}`);
      resolved = fromWeb ?? rewrittenCall;
    } else {
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
          resolved = fromWeb;
        } else {
          resolved = pub;
        }
      } else {
        resolved = pub;
      }
    }
  }

  if (!resolved && fromWeb) resolved = fromWeb;

  if (!resolved) {
    // Last resort — never return bare docker DNS to browsers
    const internal = getLiveKitInternalUrl();
    if (internal.startsWith('https://')) resolved = internal.replace(/^https/, 'wss');
    else if (internal.startsWith('http://')) resolved = internal.replace(/^http/, 'ws');
    else resolved = internal;
  }

  return ensureLiveKitPublicUrlPath(resolved);
}

function roomServiceAt(url: string): RoomServiceClient {
  const apiKey = trimEnv('LIVEKIT_API_KEY');
  const apiSecret = trimEnv('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) {
    throw new Error('livekit_not_configured');
  }
  return new RoomServiceClient(url, apiKey, apiSecret);
}

function isRoomExistsError(msg: string): boolean {
  return /already exists|room exists|conflict/i.test(msg);
}

function isTransientReachabilityError(msg: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|network|AbortError|undici|connect/i.test(
    msg,
  );
}

async function withRoomServiceFallback<T>(
  opName: string,
  fn: (svc: RoomServiceClient) => Promise<T>,
): Promise<T> {
  const candidates = getLiveKitInternalUrlCandidates();
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      const result = await fn(roomServiceAt(url));
      if (preferredInternalUrl !== url) {
        preferredInternalUrl = url;
        console.info(`[livekit] ${opName} OK via ${url}`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err;
      if (isRoomExistsError(msg)) {
        preferredInternalUrl = url;
        throw err;
      }
      // Auth/validation — нет смысла перебирать другие URL с теми же ключами.
      if (!isTransientReachabilityError(msg)) {
        throw err;
      }
      console.warn(`[livekit] ${opName} via ${url} failed: ${msg}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? `${opName} failed`));
}

/** Проверка Room Service (listRooms) — для /health/livekit и boot-логов. */
export async function probeLiveKitRoomService(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
  configured: boolean;
}> {
  if (!isLiveKitConfigured()) {
    return { ok: false, configured: false, error: 'not_configured' };
  }
  try {
    await withRoomServiceFallback('listRooms', async (svc) => {
      await svc.listRooms();
    });
    return { ok: true, configured: true, url: preferredInternalUrl || getLiveKitInternalUrl() };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
      url: getLiveKitInternalUrl(),
    };
  }
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
  try {
    await withRoomServiceFallback('createRoom', async (svc) => {
      await svc.createRoom({
        name: input.roomName,
        emptyTimeout: input.emptyTimeoutSec ?? 900,
        // Дать клиенту время на LiveKit reconnect, не считая комнату пустой.
        departureTimeout: 180,
        maxParticipants: input.maxParticipants,
        metadata: input.metadata,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Idempotent: room may already exist
    if (isRoomExistsError(msg)) {
      return;
    }
    // LiveKit создаёт комнату при первом join. Не валим звонок, если Room Service
    // недоступен из api (часто UFW docker→host:7880), а публичный WSS /lk жив.
    console.error(
      '[livekit] createRoom failed (continuing — room auto-creates on join):',
      msg,
    );
  }
}

export async function endLiveKitRoom(roomName: string): Promise<void> {
  if (!isLiveKitConfigured()) return;
  try {
    await withRoomServiceFallback('deleteRoom', async (svc) => {
      await svc.deleteRoom(roomName);
    });
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
    await withRoomServiceFallback('removeParticipant', async (svc) => {
      await svc.removeParticipant(roomName, identity);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist/i.test(msg)) return;
    console.warn('[livekit] removeParticipant:', msg);
  }
}

/**
 * Список identity участников в комнате LiveKit.
 * `null` — Room Service недоступен / комната не найдена (не путать с пустым списком).
 */
export async function listLiveKitParticipantIdentities(
  roomName: string,
): Promise<string[] | null> {
  if (!isLiveKitConfigured()) return null;
  try {
    return await withRoomServiceFallback('listParticipants', async (svc) => {
      const parts = await svc.listParticipants(roomName);
      return parts.map((p) => String(p.identity ?? '')).filter(Boolean);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|does not exist/i.test(msg)) return [];
    console.warn('[livekit] listParticipants:', msg);
    return null;
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
  // До 8 ч — длинные конференции; reconnect после TTL требует свежий JWT.
  const ttl =
    input.ttlSeconds ??
    Math.max(60, Math.min(28_800, Number(process.env.CALL_TOKEN_TTL_SEC ?? 14_400) || 14_400));

  const avatar = String(input.avatarUrl ?? '').trim();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl,
    metadata: avatar ? JSON.stringify({ avatarUrl: avatar }) : undefined,
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
