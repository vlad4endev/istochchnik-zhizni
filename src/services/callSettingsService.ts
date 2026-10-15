import { query } from '../config/db';
import {
  buildCallRuntimeConfig,
  buildCallSettingsAdminView,
  isCallLiveKitRoutingMode,
  normalizeCallSettingsDocument,
  type CallFeatureFlags,
  type CallLiveKitRoutingMode,
  type CallRuntimeConfig,
  type CallSettingsAdminView,
  type CallSettingsDocument,
  type CallStatusId,
  type CallParticipantStatusId,
  type CallEndReasonId,
  isAppRoleAllowedForCalls,
} from '../types/callSettings';
import type { AppRole } from '../types/sectionVisibilitySettings';
import {
  applyLiveKitSettingsOverride,
  getLiveKitInternalUrl,
  getLiveKitPublicUrl,
  probeLiveKitRoomService,
  probeLiveKitWithDraft,
  type LiveKitDraftProbeResult,
} from './livekitService';

let cachedRuntime: CallRuntimeConfig | null = null;
let cacheAt = 0;
const CACHE_MS = 5_000;

async function ensureColumn(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS call_settings_json TEXT');
}

export function invalidateCallSettingsCache(): void {
  cachedRuntime = null;
  cacheAt = 0;
}

export async function loadCallSettingsDocument(): Promise<CallSettingsDocument> {
  await ensureColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query('SELECT call_settings_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.call_settings_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return normalizeCallSettingsDocument(null);
  }
  try {
    return normalizeCallSettingsDocument(JSON.parse(raw) as unknown);
  } catch {
    return normalizeCallSettingsDocument(null);
  }
}

export async function saveCallSettingsDocument(doc: CallSettingsDocument): Promise<void> {
  await ensureColumn();
  const json = JSON.stringify(doc);
  await query(
    `INSERT INTO global_settings (id, start_date, call_settings_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET call_settings_json = EXCLUDED.call_settings_json`,
    [json],
  );
  invalidateCallSettingsCache();
}

function pushLiveKitOverride(runtime: CallRuntimeConfig): void {
  applyLiveKitSettingsOverride({
    apiKey: runtime.livekit.api_key || null,
    apiSecret: runtime.livekit.api_secret || null,
    internalUrl: runtime.livekit.internal_url || null,
    publicUrl: runtime.livekit.public_url || null,
    tokenTtlSec: runtime.token_ttl_sec,
    routingMode: runtime.livekit.routing_mode,
    disableLocalFallbacks: runtime.livekit.disable_local_fallbacks,
  });
}

function adminViewWithEffective(
  doc: CallSettingsDocument,
  probe: CallSettingsAdminView['livekit']['probe'],
): CallSettingsAdminView {
  return buildCallSettingsAdminView(doc, probe, {
    internal_url: getLiveKitInternalUrl(),
    public_url: getLiveKitPublicUrl(),
  });
}

export async function getCallRuntimeConfig(force = false): Promise<CallRuntimeConfig> {
  if (!force && cachedRuntime && Date.now() - cacheAt < CACHE_MS) {
    return cachedRuntime;
  }
  const doc = await loadCallSettingsDocument();
  const runtime = buildCallRuntimeConfig(doc);
  cachedRuntime = runtime;
  cacheAt = Date.now();
  pushLiveKitOverride(runtime);
  return runtime;
}

/** Sync peek: last loaded config or env-derived defaults. */
export function peekCallRuntimeConfig(): CallRuntimeConfig {
  if (cachedRuntime) return cachedRuntime;
  return buildCallRuntimeConfig(normalizeCallSettingsDocument(null));
}

export async function warmCallSettingsCache(): Promise<void> {
  await getCallRuntimeConfig(true);
}

export async function getCallSettingsAdmin(options?: {
  probe?: boolean;
}): Promise<CallSettingsAdminView> {
  const doc = await loadCallSettingsDocument();
  const runtime = buildCallRuntimeConfig(doc);
  pushLiveKitOverride(runtime);
  cachedRuntime = runtime;
  cacheAt = Date.now();

  let probe: CallSettingsAdminView['livekit']['probe'] = null;
  if (options?.probe !== false) {
    probe = await probeLiveKitRoomService();
  }
  return adminViewWithEffective(doc, probe);
}

export interface CallSettingsPatch {
  enabled?: boolean | null;
  livekit_api_key?: string | null;
  livekit_api_secret?: string | null;
  livekit_internal_url?: string | null;
  livekit_public_url?: string | null;
  livekit_routing_mode?: CallLiveKitRoutingMode;
  livekit_disable_local_fallbacks?: boolean;
  ring_timeout_sec?: number | null;
  token_ttl_sec?: number | null;
  invite_ttl_hours?: number | null;
  max_group_participants?: number | null;
  ghost_grace_sec?: number | null;
  ghost_miss_ticks?: number | null;
  features?: Partial<CallFeatureFlags>;
  allowed_roles?: AppRole[];
  status_labels?: {
    call?: Partial<Record<CallStatusId, string | null>>;
    participant?: Partial<Record<CallParticipantStatusId, string | null>>;
    end_reason?: Partial<Record<CallEndReasonId, string | null>>;
  };
  /** Сбросить LiveKit-секреты в БД (останется env) */
  clear_livekit_api_key?: boolean;
  clear_livekit_api_secret?: boolean;
}

function applyLabelPatch<T extends string>(
  current: Partial<Record<T, string>>,
  patch: Partial<Record<T, string | null>> | undefined,
): Partial<Record<T, string>> {
  if (!patch) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch) as Array<[T, string | null | undefined]>) {
    if (value === null || value === '') {
      delete next[key];
    } else if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim().slice(0, 80);
    }
  }
  return next;
}

export async function updateCallSettings(patch: CallSettingsPatch): Promise<CallSettingsAdminView> {
  const current = await loadCallSettingsDocument();
  const next: CallSettingsDocument = {
    ...current,
    livekit: { ...current.livekit },
    features: { ...current.features },
    status_labels: {
      call: { ...current.status_labels.call },
      participant: { ...current.status_labels.participant },
      end_reason: { ...current.status_labels.end_reason },
    },
  };

  if (patch.enabled !== undefined) {
    next.enabled = patch.enabled;
  }
  if (patch.clear_livekit_api_key) {
    next.livekit.api_key = null;
  } else if (patch.livekit_api_key !== undefined) {
    const t = typeof patch.livekit_api_key === 'string' ? patch.livekit_api_key.trim() : '';
    if (t) next.livekit.api_key = t;
  }
  if (patch.clear_livekit_api_secret) {
    next.livekit.api_secret = null;
  } else if (patch.livekit_api_secret !== undefined) {
    const t = typeof patch.livekit_api_secret === 'string' ? patch.livekit_api_secret.trim() : '';
    if (t) next.livekit.api_secret = t;
  }
  if (patch.livekit_internal_url !== undefined) {
    next.livekit.internal_url =
      typeof patch.livekit_internal_url === 'string' && patch.livekit_internal_url.trim()
        ? patch.livekit_internal_url.trim().replace(/\/$/, '')
        : null;
  }
  if (patch.livekit_public_url !== undefined) {
    next.livekit.public_url =
      typeof patch.livekit_public_url === 'string' && patch.livekit_public_url.trim()
        ? patch.livekit_public_url.trim()
        : null;
  }
  if (patch.livekit_routing_mode !== undefined && isCallLiveKitRoutingMode(patch.livekit_routing_mode)) {
    next.livekit.routing_mode = patch.livekit_routing_mode;
    // При смене режима без явного флага — разумный default для fallbacks.
    if (patch.livekit_disable_local_fallbacks === undefined) {
      next.livekit.disable_local_fallbacks = patch.livekit_routing_mode === 'remote_server';
    }
  }
  if (typeof patch.livekit_disable_local_fallbacks === 'boolean') {
    next.livekit.disable_local_fallbacks = patch.livekit_disable_local_fallbacks;
  }

  if (patch.ring_timeout_sec !== undefined) next.ring_timeout_sec = patch.ring_timeout_sec;
  if (patch.token_ttl_sec !== undefined) next.token_ttl_sec = patch.token_ttl_sec;
  if (patch.invite_ttl_hours !== undefined) next.invite_ttl_hours = patch.invite_ttl_hours;
  if (patch.max_group_participants !== undefined) {
    next.max_group_participants = patch.max_group_participants;
  }
  if (patch.ghost_grace_sec !== undefined) next.ghost_grace_sec = patch.ghost_grace_sec;
  if (patch.ghost_miss_ticks !== undefined) next.ghost_miss_ticks = patch.ghost_miss_ticks;

  if (patch.features) {
    next.features = {
      ...next.features,
      ...Object.fromEntries(
        Object.entries(patch.features).filter(([, v]) => typeof v === 'boolean'),
      ),
    } as CallFeatureFlags;
  }
  if (patch.allowed_roles) {
    next.allowed_roles = patch.allowed_roles;
  }
  if (patch.status_labels) {
    next.status_labels = {
      call: applyLabelPatch(next.status_labels.call, patch.status_labels.call),
      participant: applyLabelPatch(next.status_labels.participant, patch.status_labels.participant),
      end_reason: applyLabelPatch(next.status_labels.end_reason, patch.status_labels.end_reason),
    };
  }

  const normalized = normalizeCallSettingsDocument(next);
  await saveCallSettingsDocument(normalized);
  return getCallSettingsAdmin({ probe: true });
}

export async function assertCallsFeatureEnabled(): Promise<CallRuntimeConfig> {
  const cfg = await getCallRuntimeConfig();
  return cfg;
}

export async function isCallsEnabledEffective(): Promise<boolean> {
  const cfg = await getCallRuntimeConfig();
  return cfg.enabled;
}

export function isCallsEnabledSync(): boolean {
  return peekCallRuntimeConfig().enabled;
}

export async function assertRoleCanStartCalls(role: string | null | undefined): Promise<void> {
  const cfg = await getCallRuntimeConfig();
  if (!isAppRoleAllowedForCalls(role, cfg.allowed_roles)) {
    const err = new Error('role_not_allowed');
    err.name = 'CallsRoleError';
    throw err;
  }
}

export async function assertFeatureAllowed(
  feature: keyof CallFeatureFlags,
): Promise<CallRuntimeConfig> {
  const cfg = await getCallRuntimeConfig();
  if (!cfg.features[feature]) {
    const err = new Error(`feature_disabled:${feature}`);
    err.name = 'CallsFeatureError';
    throw err;
  }
  return cfg;
}

export type LiveKitConnectionTestInput = {
  livekit_api_key?: string | null;
  livekit_api_secret?: string | null;
  livekit_internal_url?: string | null;
  livekit_public_url?: string | null;
  livekit_routing_mode?: CallLiveKitRoutingMode | null;
  livekit_disable_local_fallbacks?: boolean | null;
};

/** Dry-run проверка LiveKit без записи в БД. */
export async function testLiveKitConnection(
  input: LiveKitConnectionTestInput = {},
): Promise<LiveKitDraftProbeResult> {
  // Убедиться, что текущий override загружен (для fallback ключей из env/БД).
  await getCallRuntimeConfig();
  return probeLiveKitWithDraft({
    apiKey: input.livekit_api_key,
    apiSecret: input.livekit_api_secret,
    internalUrl: input.livekit_internal_url,
    publicUrl: input.livekit_public_url,
    routingMode: input.livekit_routing_mode ?? undefined,
    disableLocalFallbacks: input.livekit_disable_local_fallbacks ?? undefined,
  });
}
