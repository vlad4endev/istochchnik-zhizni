import { randomUUID } from 'node:crypto';

import { query as dbQuery } from '../config/db';
import { getUnreadMessagesCount } from '../lib/unreadHelpers';
import type {
  ConversationListItem,
  ConversationType,
  ConversationMember,
  MessagePayload,
  MessagePayloadType,
  MessageWithSender,
  ParticipantRole,
  PermissionsJson,
} from '../types/messenger';
import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';
import { getPrayerCycleSnapshotForDate } from './prayerCycleService';
import { sendPushNotification } from './pushService';
import { rewriteStorageUrlsInRecord, rewriteSupabaseStorageUrlForClient } from '../lib/supabaseStorage';
import {
  decryptMessageText,
  encryptMessageText,
  isMessageEncryptionEnabled,
} from '../lib/messageCrypto';
import { normalizeChatDisplayText } from '../utils/normalizeChatDisplayText';
import { coerceBirthDateToYmd } from '../lib/birthDate';

const MARK_READ_DEDUP_WINDOW_MS = 5_000;
const recentMarkReadCalls = new Map<string, number>();

// ─── Helpers ──────────────────────────────────────────────────

function bigint(v: unknown): string {
  return String(v);
}

/** Публичный URL для аватаров/обложек чатов в ответах API (HTTPS, без LAN-mixed-content). */
function rewriteMessengerPublicUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return rewriteSupabaseStorageUrlForClient(t);
}

/**
 * Логотип группы/канала: основная колонка `conversations.avatar_url` или легаси в JSON
 * (`metadata` / `settings`), чтобы список чатов и meta не теряли картинку.
 */
function pickConversationAvatarFromParts(args: {
  avatar_url?: unknown;
  metadata?: Record<string, unknown> | undefined;
  settings?: Record<string, unknown> | undefined;
}): string | null {
  const col = args.avatar_url;
  if (col != null && String(col).trim() !== '') return String(col).trim();

  const keys = ['avatar_url', 'avatarUrl', 'photo_url', 'photoUrl', 'logo_url', 'logoUrl'] as const;
  const scan = (bag: Record<string, unknown> | undefined): string | null => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
    for (const k of keys) {
      const v = bag[k];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return null;
  };

  return scan(args.metadata) ?? scan(args.settings) ?? null;
}

function pgErrorCode(e: unknown): string | undefined {
  const c =
    e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : undefined;
  if (typeof c === 'string') return c;
  if (typeof c === 'number') return String(c);
  return undefined;
}

function isPgUndefinedColumnError(e: unknown): boolean {
  return pgErrorCode(e) === '42703';
}

/**
 * Права/мьют участника для checkChatPermission. Несколько вариантов SELECT на случай старой БД без
 * колонок `left_at`, `permissions` и т.д. (иначе middleware ловит 500 «Failed to authorize chat action»).
 */
export async function getParticipantChatAuthRow(
  conversationId: string,
  memberId: number,
): Promise<{ permissions: PermissionsJson; muted_until: string | null }> {
  const attempts: Array<{ sql: string; muteOnly: boolean }> = [
    {
      sql: `SELECT permissions, muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
            LIMIT 1`,
      muteOnly: false,
    },
    {
      sql: `SELECT permissions, muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: false,
    },
    {
      sql: `SELECT muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
            LIMIT 1`,
      muteOnly: true,
    },
    {
      sql: `SELECT muted_until FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: true,
    },
    {
      sql: `SELECT 1 AS present FROM conversation_participants
            WHERE conversation_id = $1 AND member_id = $2
            LIMIT 1`,
      muteOnly: false,
    },
  ];

  for (const { sql, muteOnly } of attempts) {
    try {
      const result = await dbQuery(sql, [conversationId, memberId]);
      const row = result.rows[0];
      if (!row) {
        continue;
      }
      if ('present' in row) {
        return { permissions: {}, muted_until: null };
      }
      if (muteOnly) {
        return { permissions: {}, muted_until: (row.muted_until as string | null) ?? null };
      }
      return {
        permissions: (row.permissions ?? {}) as PermissionsJson,
        muted_until: (row.muted_until as string | null) ?? null,
      };
    } catch (e) {
      if (!isPgUndefinedColumnError(e)) {
        throw e;
      }
      console.warn(
        '[messenger] getParticipantChatAuthRow: fallback (42703 undefined column), trying simpler SELECT',
        (e as Error)?.message,
      );
    }
  }
  console.warn('[messenger] getParticipantChatAuthRow: no matching row from fallbacks, using empty overrides');
  return { permissions: {}, muted_until: null };
}

// ─── Conversations ────────────────────────────────────────────

const MUTE_UNTIL_FAR = '2099-12-31T23:59:59.999Z';

function mapParticipantUiExtras(r: {
  muted_until?: unknown;
  ui_pinned?: unknown;
  ui_pinned_at?: unknown;
  ui_folder?: unknown;
}): Pick<
  ConversationListItem,
  'my_muted' | 'my_muted_until' | 'my_ui_pinned' | 'my_ui_pinned_at' | 'my_ui_folder'
> {
  const mutedUntil = r.muted_until != null ? String(r.muted_until) : null;
  const muted =
    mutedUntil != null &&
    !Number.isNaN(new Date(mutedUntil).getTime()) &&
    new Date(mutedUntil).getTime() > Date.now();
  const folderRaw = r.ui_folder != null ? String(r.ui_folder) : null;
  const my_ui_folder =
    folderRaw === 'personal' || folderRaw === 'ministry' ? folderRaw : null;
  return {
    my_muted: muted,
    my_muted_until: mutedUntil,
    my_ui_pinned: Boolean(r.ui_pinned),
    my_ui_pinned_at: r.ui_pinned_at != null ? String(r.ui_pinned_at) : null,
    my_ui_folder,
  };
}

function lastMessageListPreviewContent(rawContent: unknown, payloadType: unknown): string {
  const resolvedContent =
    typeof rawContent === 'string' ? decryptMessageText(rawContent) : '';
  const s = resolvedContent.trim();
  if (s) return resolvedContent;
  const pt = String(payloadType ?? '').trim();
  if (pt === 'audio') return '🎤 Голосовое сообщение';
  if (pt === 'video_note') return '🎥 Видеосообщение';
  if (pt === 'image') return '📷 Фото';
  if (pt === 'file') return '📎 Файл';
  if (pt === 'poll') return '📊 Опрос';
  return typeof rawContent === 'string' ? rawContent : '';
}

function resolveE2EEFieldsFromPayload(payload: MessagePayload): { isE2EE: boolean; encryptedPayload: string | null } {
  const source = payload as Record<string, unknown>;
  const encryptedCandidate =
    typeof source.encrypted_payload === 'string'
      ? source.encrypted_payload
      : typeof source.encryptedPayload === 'string'
        ? source.encryptedPayload
        : '';
  const encryptedPayload = encryptedCandidate.trim() || null;
  const isE2EERaw = source.is_e2ee ?? source.isE2EE;
  const isE2EE = Boolean(isE2EERaw) || Boolean(encryptedPayload);
  return { isE2EE, encryptedPayload };
}

/**
 * List conversations the member participates in, sorted by last activity.
 * Includes last message preview and unread count.
 */
export async function listConversations(memberId: number): Promise<ConversationListItem[]> {
  const result = await dbQuery(
    `
    SELECT
      c.id,
      c.type,
      c.title,
      c.avatar_url,
      c.updated_at,
      c.default_permissions,
      c.settings,
      c.metadata,
      cp.muted_until,
      cp.ui_pinned,
      cp.ui_pinned_at,
      cp.ui_folder,
      -- last message
      lm.id            AS lm_id,
      lm.content       AS lm_content,
      lm.sender_id     AS lm_sender_id,
      lm.created_at    AS lm_created_at,
      lm.is_deleted    AS lm_is_deleted,
      lm.payload_type  AS lm_payload_type,
      COALESCE(
        NULLIF(TRIM(COALESCE(lm_sender.first_name, '') || ' ' || COALESCE(lm_sender.last_name, '')), ''),
        CASE WHEN lm.payload_type::text = 'access_request' THEN 'Заявки' ELSE NULL END
      ) AS lm_sender_name,
      CASE
        WHEN lm.id IS NULL THEN NULL
        WHEN lm.sender_id IS DISTINCT FROM $1 THEN NULL
        ELSE COALESCE(
          (
            SELECT COALESCE(MAX(COALESCE(cp2.last_read_message_id, 0)), 0) >= lm.id
            FROM conversation_participants cp2
            WHERE cp2.conversation_id = c.id
              AND cp2.member_id IS DISTINCT FROM $1
              AND cp2.left_at IS NULL
          ),
          FALSE
        )
      END AS lm_read_by_others,
      -- unread count
      COALESCE(
        urc.cnt,
        0
      ) AS unread_count,
      -- other member for private chats
      om.id          AS om_id,
      om.name        AS om_name,
      om.first_name  AS om_first_name,
      om.last_name   AS om_last_name,
      om.avatar_url  AS om_avatar_url,
      om.last_seen_at AS om_last_seen_at,
      om.app_role    AS om_app_role,
      om.app_roles   AS om_app_roles,
      om.public_key  AS om_public_key
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    -- last message via lateral
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.sender_id, m.created_at, m.is_deleted, m.payload_type
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN members lm_sender ON lm_sender.id = lm.sender_id
    -- unread count via lateral join (same filter as total unread badge)
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM messages m2
      WHERE m2.conversation_id = c.id
        AND m2.id > COALESCE(cp.last_read_message_id, 0)
        AND m2.sender_id IS DISTINCT FROM $1
        AND m2.payload_type::text NOT IN ('access_request', 'system', 'notification')
    ) urc ON TRUE
    -- other member for private chats
    LEFT JOIN LATERAL (
      SELECT om2.id, om2.name, om2.first_name, om2.last_name, om2.avatar_url, om2.last_seen_at, om2.app_role, om2.app_roles, om2.public_key
      FROM conversation_participants op
      JOIN members om2 ON om2.id = op.member_id
      WHERE op.conversation_id = c.id
        AND op.member_id != $1
        AND op.left_at IS NULL
        AND c.type = 'private'
      LIMIT 1
    ) om ON TRUE
    WHERE cp.member_id = $1
      AND cp.left_at IS NULL
    ORDER BY
      CASE WHEN COALESCE(cp.ui_pinned, FALSE) THEN 0 ELSE 1 END,
      cp.ui_pinned_at DESC NULLS LAST,
      c.updated_at DESC
    `,
    [memberId],
  );

  return result.rows.map((r) => {
    const metaRaw = r.metadata;
    const metadata =
      metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : undefined;
    const st = r.settings;
    const settings =
      st && typeof st === 'object' && !Array.isArray(st) ? (st as Record<string, unknown>) : undefined;
    const dp = r.default_permissions;
    const default_permissions =
      dp && typeof dp === 'object' && !Array.isArray(dp) ? (dp as PermissionsJson) : undefined;

    const avatarPick = pickConversationAvatarFromParts({
      avatar_url: r.avatar_url,
      metadata,
      settings,
    });

    return {
      id: bigint(r.id),
      type: r.type as ConversationType,
      title: r.title,
      avatar_url: rewriteMessengerPublicUrl(avatarPick),
      updated_at: r.updated_at,
      default_permissions,
      settings,
      metadata,
      last_message: r.lm_id
        ? {
            id: bigint(r.lm_id),
            content: lastMessageListPreviewContent(r.lm_content, r.lm_payload_type),
            sender_id: r.lm_sender_id,
            sender_name: r.lm_sender_name?.trim() || null,
            created_at: r.lm_created_at,
            is_deleted: r.lm_is_deleted,
            ...(r.lm_sender_id != null && Number(r.lm_sender_id) === memberId
              ? { read_by_others: Boolean(r.lm_read_by_others) }
              : {}),
          }
        : null,
      unread_count: Number(r.unread_count),
      other_member: r.om_id
        ? {
            id: r.om_id,
            name: r.om_name,
            first_name: r.om_first_name,
            last_name: r.om_last_name,
            avatar_url: rewriteMessengerPublicUrl(r.om_avatar_url ?? null),
            last_seen_at:
              r.om_last_seen_at != null
                ? new Date(r.om_last_seen_at as string | Date).toISOString()
                : null,
            app_role: r.om_app_role != null ? String(r.om_app_role) : null,
            app_roles: Array.isArray(r.om_app_roles)
              ? (r.om_app_roles as unknown[]).map((x) => String(x))
              : null,
            public_key: r.om_public_key != null ? String(r.om_public_key) : null,
          }
        : null,
      ...mapParticipantUiExtras({
        muted_until: r.muted_until,
        ui_pinned: r.ui_pinned,
        ui_pinned_at: r.ui_pinned_at,
        ui_folder: r.ui_folder,
      }),
    };
  });
}

export async function getConversationMeta(
  conversationId: string,
): Promise<Pick<
  ConversationListItem,
  'id' | 'type' | 'title' | 'avatar_url' | 'updated_at' | 'default_permissions' | 'settings' | 'metadata'
> | null> {
  function mapMetaRowFromDbRow(r: Record<string, unknown>): Pick<
    ConversationListItem,
    'id' | 'type' | 'title' | 'avatar_url' | 'updated_at' | 'default_permissions' | 'settings' | 'metadata'
  > {
    const metaRaw = r.metadata;
    const metadata =
      metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : undefined;
    const dp = r.default_permissions;
    const default_permissions =
      dp && typeof dp === 'object' && !Array.isArray(dp) ? (dp as PermissionsJson) : undefined;
    const st = r.settings;
    const settings =
      st && typeof st === 'object' && !Array.isArray(st) ? (st as Record<string, unknown>) : undefined;
    const avatarPick = pickConversationAvatarFromParts({
      avatar_url: r.avatar_url,
      metadata,
      settings,
    });

    return {
      id: bigint(r.id),
      type: r.type as ConversationType,
      title: r.title as string | null,
      avatar_url: rewriteMessengerPublicUrl(avatarPick),
      updated_at: r.updated_at as string,
      default_permissions,
      settings,
      metadata,
    };
  }

  const sqlAttempts = [
    `SELECT id, type, title, avatar_url, updated_at, default_permissions, settings, metadata
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at, default_permissions, settings
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at, default_permissions
     FROM conversations WHERE id = $1 LIMIT 1`,
    `SELECT id, type, title, avatar_url, updated_at
     FROM conversations WHERE id = $1 LIMIT 1`,
  ];

  let lastErr: unknown;
  for (let i = 0; i < sqlAttempts.length; i++) {
    try {
      const result = await dbQuery(sqlAttempts[i], [conversationId]);
      const row = result.rows[0];
      if (!row) return null;
      return mapMetaRowFromDbRow(row as Record<string, unknown>);
    } catch (e) {
      lastErr = e;
      if (pgErrorCode(e) !== '42703') {
        throw e;
      }
      console.warn(
        `[messenger] getConversationMeta: 42703 on attempt ${i + 1}/${sqlAttempts.length}, retrying simpler SELECT`,
        (e as Error)?.message,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Курсор прочитанного текущего участника (для «перейти к непрочитанным» на клиенте). */
export async function getParticipantLastReadMessageId(
  conversationId: string,
  memberId: number,
): Promise<string | null> {
  const result = await dbQuery(
    `SELECT last_read_message_id::text AS lid
     FROM conversation_participants
     WHERE conversation_id = $1::bigint AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  const raw = result.rows[0]?.lid as string | undefined | null;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

export async function updateConversationPermissionsAndSettings(
  conversationId: string,
  patch: {
    default_permissions?: PermissionsJson;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    title?: string;
    avatar_url?: string | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(patch.title);
  }
  if (patch.avatar_url !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    params.push(patch.avatar_url);
  }
  if (patch.default_permissions !== undefined) {
    sets.push(`default_permissions = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.default_permissions));
  }
  if (patch.settings !== undefined) {
    sets.push(`settings = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.settings));
  }
  if (patch.metadata !== undefined) {
    sets.push(`metadata = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.metadata));
  }

  if (sets.length === 0) return;
  params.push(conversationId);

  try {
    await dbQuery(`UPDATE conversations SET ${sets.join(', ')} WHERE id = $${i}`, params);
  } catch (e) {
    if (isPgUndefinedColumnError(e)) {
      // Old DB schema; surface a clear error instead of generic 500.
      const msg =
        'DB schema is outdated for messenger conversations. ' +
        'Run DB init/migrations (initDb) to add columns default_permissions/settings/metadata.';
      const err = new Error(msg) as Error & { cause?: unknown };
      err.cause = e;
      throw err;
    }
    throw e;
  }
}

export async function listConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const attempts: string[] = [
    // Modern schema
    `SELECT
        cp.member_id,
        cp.role,
        cp.joined_at,
        cp.muted_until,
        cp.permissions,
        m.name,
        m.first_name,
        m.last_name,
        m.avatar_url,
        m.last_seen_at,
        m.public_key
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1
       AND cp.left_at IS NULL
     ORDER BY
       CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       cp.joined_at ASC`,
    // Missing `left_at`
    `SELECT
        cp.member_id,
        cp.role,
        cp.joined_at,
        cp.muted_until,
        cp.permissions,
        m.name,
        m.first_name,
        m.last_name,
        m.avatar_url,
        m.last_seen_at,
        m.public_key
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1
     ORDER BY
       CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       cp.joined_at ASC`,
    // Missing permissions/mute columns
    `SELECT
        cp.member_id,
        cp.role,
        cp.joined_at,
        m.name,
        m.first_name,
        m.last_name,
        m.avatar_url,
        m.last_seen_at,
        m.public_key
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1
     ORDER BY
       CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       cp.joined_at ASC`,
    // Very old schema: only member_id/role
    `SELECT
        cp.member_id,
        cp.role,
        m.name,
        m.first_name,
        m.last_name,
        m.avatar_url
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1
     ORDER BY
       CASE cp.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       cp.member_id ASC`,
  ];

  let lastErr: unknown = null;
  for (const sql of attempts) {
    try {
      const result = await dbQuery(sql, [conversationId]);
      const baseMembersRaw = result.rows.map((r) => ({
        member_id: Number(r.member_id),
        role: r.role as ParticipantRole,
        joined_at: r.joined_at ?? new Date().toISOString(),
        muted_until: r.muted_until ?? null,
        permissions: (r.permissions ?? {}) as PermissionsJson,
        name: r.name,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        avatar_url: r.avatar_url ?? null,
        last_seen_at:
          r.last_seen_at != null
            ? new Date(r.last_seen_at as string | Date).toISOString()
            : null,
        public_key: r.public_key ?? null,
      }));
      const seenIds = new Set<number>();
      const baseMembers = baseMembersRaw.filter((row) => {
        const id = Number(row.member_id);
        if (!Number.isFinite(id) || id < 1 || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });
      if (baseMembers.length === 0) return baseMembers;

      const today = new Date().toISOString().slice(0, 10);
      const snap = await getPrayerCycleSnapshotForDate(today);
      const currentCycleIndex = snap?.cycle_index ?? 0;
      if (currentCycleIndex <= 0) return baseMembers;

      try {
        const memberIds = baseMembers.map((m) => m.member_id);
        const historyResult = await dbQuery(
          `SELECT
             ranked.member_id,
             ranked.cycle_index,
             ranked.prayer_request,
             ranked.updated_at
           FROM (
             SELECT
               mpc.member_id,
               mpc.cycle_index,
               mpc.prayer_request,
               mpc.updated_at,
               ROW_NUMBER() OVER (
                 PARTITION BY mpc.member_id
                 ORDER BY mpc.cycle_index DESC, mpc.updated_at DESC
               ) AS rn
             FROM member_prayer_by_cycle mpc
             WHERE mpc.member_id = ANY($1::int[])
               AND mpc.cycle_index < $2
               AND NULLIF(TRIM(COALESCE(mpc.prayer_request, '')), '') IS NOT NULL
           ) AS ranked
           WHERE ranked.rn <= 3
           ORDER BY ranked.member_id ASC, ranked.cycle_index DESC, ranked.updated_at DESC`,
          [memberIds, currentCycleIndex],
        );

        const historyByMember = new Map<
          number,
          Array<{ cycle_index: number; prayer_request: string; updated_at: string | null }>
        >();
        for (const row of historyResult.rows as Array<Record<string, unknown>>) {
          const memberId = Number(row.member_id);
          const current = historyByMember.get(memberId) ?? [];
          current.push({
            cycle_index: Number(row.cycle_index),
            prayer_request: String(row.prayer_request),
            updated_at: row.updated_at ? String(row.updated_at) : null,
          });
          historyByMember.set(memberId, current);
        }

        return baseMembers.map((member) => ({
          ...member,
          previous_prayer_requests: historyByMember.get(member.member_id) ?? [],
        }));
      } catch (e) {
        // Backward compatibility for environments without prayer-cycle tables/columns.
        if (pgErrorCode(e) === '42P01' || pgErrorCode(e) === '42703') {
          return baseMembers;
        }
        throw e;
      }
    } catch (e) {
      lastErr = e;
      if (!isPgUndefinedColumnError(e)) {
        throw e;
      }
      console.warn('[messenger] listConversationMembers: fallback (42703 undefined column), retrying simpler SELECT', (e as Error)?.message);
    }
  }
  throw lastErr ?? new Error('Failed to list conversation members');
}

export async function updateMemberRoleAndPermissions(
  conversationId: string,
  memberId: number,
  patch: { role?: ParticipantRole; permissions?: PermissionsJson; muted_until?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.role !== undefined) {
    sets.push(`role = $${i++}`);
    params.push(patch.role);
  }
  if (patch.permissions !== undefined) {
    sets.push(`permissions = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.permissions));
  }
  if (patch.muted_until !== undefined) {
    sets.push(`muted_until = $${i++}`);
    params.push(patch.muted_until);
  }
  if (sets.length === 0) return;

  params.push(conversationId, memberId);
  await dbQuery(
    `UPDATE conversation_participants
     SET ${sets.join(', ')}
     WHERE conversation_id = $${i++} AND member_id = $${i} AND left_at IS NULL`,
    params,
  );
}

/**
 * Fetch a single conversation list item shaped for a specific member.
 * (Important: `other_member` for private chats must be computed from the recipient's POV.)
 */
export async function getConversationListItem(
  memberId: number,
  conversationId: string,
): Promise<ConversationListItem | null> {
  const result = await dbQuery(
    `
    SELECT
      c.id,
      c.type,
      c.title,
      c.avatar_url,
      c.updated_at,
      c.default_permissions,
      c.settings,
      c.metadata,
      cp.muted_until,
      cp.ui_pinned,
      cp.ui_pinned_at,
      cp.ui_folder,
      -- last message
      lm.id            AS lm_id,
      lm.content       AS lm_content,
      lm.sender_id     AS lm_sender_id,
      lm.created_at    AS lm_created_at,
      lm.is_deleted    AS lm_is_deleted,
      lm.payload_type  AS lm_payload_type,
      COALESCE(
        NULLIF(TRIM(COALESCE(lm_sender.first_name, '') || ' ' || COALESCE(lm_sender.last_name, '')), ''),
        CASE WHEN lm.payload_type::text = 'access_request' THEN 'Заявки' ELSE NULL END
      ) AS lm_sender_name,
      CASE
        WHEN lm.id IS NULL THEN NULL
        WHEN lm.sender_id IS DISTINCT FROM $1 THEN NULL
        ELSE COALESCE(
          (
            SELECT COALESCE(MAX(COALESCE(cp2.last_read_message_id, 0)), 0) >= lm.id
            FROM conversation_participants cp2
            WHERE cp2.conversation_id = c.id
              AND cp2.member_id IS DISTINCT FROM $1
              AND cp2.left_at IS NULL
          ),
          FALSE
        )
      END AS lm_read_by_others,
      -- unread count
      COALESCE(
        (SELECT COUNT(*)::int FROM messages m2
         WHERE m2.conversation_id = c.id
           AND m2.id > COALESCE(cp.last_read_message_id, 0)
           AND m2.sender_id IS DISTINCT FROM $1
           AND m2.payload_type::text NOT IN ('access_request', 'system', 'notification')),
        0
      ) AS unread_count,
      -- other member for private chats
      om.id          AS om_id,
      om.name        AS om_name,
      om.first_name  AS om_first_name,
      om.last_name   AS om_last_name,
      om.avatar_url  AS om_avatar_url,
      om.last_seen_at AS om_last_seen_at,
      om.app_role    AS om_app_role,
      om.app_roles   AS om_app_roles,
      om.public_key  AS om_public_key
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.sender_id, m.created_at, m.is_deleted, m.payload_type
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN members lm_sender ON lm_sender.id = lm.sender_id
    LEFT JOIN LATERAL (
      SELECT om2.id, om2.name, om2.first_name, om2.last_name, om2.avatar_url, om2.last_seen_at, om2.app_role, om2.app_roles, om2.public_key
      FROM conversation_participants op
      JOIN members om2 ON om2.id = op.member_id
      WHERE op.conversation_id = c.id
        AND op.member_id != $1
        AND op.left_at IS NULL
        AND c.type = 'private'
      LIMIT 1
    ) om ON TRUE
    WHERE cp.member_id = $1
      AND cp.left_at IS NULL
      AND c.id = $2
    LIMIT 1
    `,
    [memberId, conversationId],
  );

  const r = result.rows[0];
  if (!r) return null;

  const metaRaw = r.metadata;
  const metadata =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, unknown>)
      : undefined;
  const st = r.settings;
  const settings =
    st && typeof st === 'object' && !Array.isArray(st) ? (st as Record<string, unknown>) : undefined;
  const dp = r.default_permissions;
  const default_permissions =
    dp && typeof dp === 'object' && !Array.isArray(dp) ? (dp as PermissionsJson) : undefined;

  const avatarPick = pickConversationAvatarFromParts({
    avatar_url: r.avatar_url,
    metadata,
    settings,
  });

  return {
    id: bigint(r.id),
    type: r.type as ConversationType,
    title: r.title,
    avatar_url: rewriteMessengerPublicUrl(avatarPick),
    updated_at: r.updated_at,
    default_permissions,
    settings,
    metadata,
    last_message: r.lm_id
      ? {
          id: bigint(r.lm_id),
          content: lastMessageListPreviewContent(r.lm_content, r.lm_payload_type),
          sender_id: r.lm_sender_id,
          sender_name: r.lm_sender_name?.trim() || null,
          created_at: r.lm_created_at,
          is_deleted: r.lm_is_deleted,
          ...(r.lm_sender_id != null && Number(r.lm_sender_id) === memberId
            ? { read_by_others: Boolean(r.lm_read_by_others) }
            : {}),
        }
      : null,
    unread_count: Number(r.unread_count),
    other_member: r.om_id
      ? {
          id: r.om_id,
          name: r.om_name,
          first_name: r.om_first_name,
          last_name: r.om_last_name,
          avatar_url: rewriteMessengerPublicUrl(r.om_avatar_url ?? null),
          last_seen_at:
            r.om_last_seen_at != null
              ? new Date(r.om_last_seen_at as string | Date).toISOString()
              : null,
          app_role: r.om_app_role != null ? String(r.om_app_role) : null,
          app_roles: Array.isArray(r.om_app_roles)
            ? (r.om_app_roles as unknown[]).map((x) => String(x))
            : null,
        public_key: r.om_public_key != null ? String(r.om_public_key) : null,
        }
      : null,
    ...mapParticipantUiExtras({
      muted_until: r.muted_until,
      ui_pinned: r.ui_pinned,
      ui_pinned_at: r.ui_pinned_at,
      ui_folder: r.ui_folder,
    }),
  };
}

/** Push: не слать, если у получателя muted_until в будущем. */
export async function isConversationMutedForMember(
  conversationId: string,
  memberId: number,
): Promise<boolean> {
  const result = await dbQuery(
    `SELECT muted_until FROM conversation_participants
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
    [conversationId, memberId],
  );
  const row = result.rows[0] as { muted_until?: unknown } | undefined;
  const mu = row?.muted_until != null ? String(row.muted_until) : null;
  if (!mu) return false;
  const t = new Date(mu).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

export async function patchMyConversationUi(
  conversationId: string,
  memberId: number,
  patch: {
    muted?: boolean;
    uiPinned?: boolean;
    uiFolder?: 'personal' | 'ministry' | null;
  },
): Promise<void> {
  const ok = await isMemberInConversation(conversationId, memberId);
  if (!ok) throw new Error('Forbidden');

  if (patch.muted !== undefined) {
    await dbQuery(
      `UPDATE conversation_participants
       SET muted_until = $3
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
      [conversationId, memberId, patch.muted ? MUTE_UNTIL_FAR : null],
    );
  }
  if (patch.uiPinned === true) {
    await dbQuery(
      `UPDATE conversation_participants
       SET ui_pinned = TRUE, ui_pinned_at = NOW()
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
      [conversationId, memberId],
    );
  } else if (patch.uiPinned === false) {
    await dbQuery(
      `UPDATE conversation_participants
       SET ui_pinned = FALSE, ui_pinned_at = NULL
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
      [conversationId, memberId],
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uiFolder')) {
    await dbQuery(
      `UPDATE conversation_participants
       SET ui_folder = $3
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
      [conversationId, memberId, patch.uiFolder ?? null],
    );
  }
}

/** Удаляет все сообщения в чате (для всех участников). */
export async function clearConversationHistory(
  conversationId: string,
  memberId: number,
): Promise<void> {
  const ok = await isMemberInConversation(conversationId, memberId);
  if (!ok) throw new Error('Forbidden');
  await dbQuery(`DELETE FROM messages WHERE conversation_id = $1`, [conversationId]);
  await dbQuery(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
}

/**
 * Find or create a private (P2P) conversation between two members.
 */
export async function findOrCreatePersonalConversation(
  memberA: number,
  memberB: number,
): Promise<string> {
  if (memberA === memberB) throw new Error('Cannot create chat with yourself');

  // Check if private conversation already exists
  const existing = await dbQuery(
    `
    SELECT cp1.conversation_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
    JOIN conversations c ON c.id = cp1.conversation_id
    WHERE cp1.member_id = $1
      AND cp2.member_id = $2
      AND cp1.left_at IS NULL
      AND cp2.left_at IS NULL
      AND c.type = 'private'
    LIMIT 1
    `,
    [memberA, memberB],
  );

  if (existing.rows[0]) {
    return bigint(existing.rows[0].conversation_id);
  }

  // Create new
  const conv = await dbQuery(
    `INSERT INTO conversations (type) VALUES ('private') RETURNING id`,
  );
  const convId = bigint(conv.rows[0].id);

  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
    [convId, memberA, memberB],
  );

  return convId;
}

/**
 * Create a group or channel conversation.
 */
export async function createGroupConversation(
  creatorId: number,
  title: string,
  type: 'group' | 'channel',
  memberIds: number[],
): Promise<string> {
  const conv = await dbQuery(
    `INSERT INTO conversations (type, title) VALUES ($1, $2) RETURNING id`,
    [type, title.trim()],
  );
  const convId = bigint(conv.rows[0].id);

  // Creator is owner
  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, 'owner')`,
    [convId, creatorId],
  );

  // Add members
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== creatorId))];
  for (const mId of uniqueMembers) {
    await dbQuery(
      `INSERT INTO conversation_participants (conversation_id, member_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [convId, mId],
    );
  }

  return convId;
}

/**
 * Групповой чат для обсуждения песни (студия): один чат на `metadata.studio_song_id`.
 */
export async function findOrCreateStudioSongConversation(
  songId: number,
  memberId: number,
): Promise<{ conversationId: string }> {
  const existing = await dbQuery(
    `SELECT id FROM conversations
     WHERE type = 'group'
       AND (metadata->>'studio_song_id') = $1
     LIMIT 1`,
    [String(songId)],
  );
  if (existing.rows[0]?.id != null) {
    const cid = bigint(existing.rows[0].id);
    const ok = await isMemberInConversation(cid, memberId);
    if (!ok) {
      await dbQuery(
        `INSERT INTO conversation_participants (conversation_id, member_id, role)
         VALUES ($1::bigint, $2, 'member')`,
        [cid, memberId],
      );
    }
    return { conversationId: cid };
  }

  const songRes = await dbQuery(`SELECT title FROM songs WHERE id = $1 LIMIT 1`, [songId]);
  const rawTitle = songRes.rows[0]?.title;
  const title =
    typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : `Песня ${songId}`;
  const chatTitle = `Обсуждение: ${title}`.slice(0, 500);

  const ins = await dbQuery(
    `INSERT INTO conversations (type, title, metadata)
     VALUES ('group', $1, $2::jsonb)
     RETURNING id`,
    [chatTitle, JSON.stringify({ studio_song_id: String(songId) })],
  );
  const convId = bigint(ins.rows[0].id);

  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1::bigint, $2, 'owner')`,
    [convId, memberId],
  );

  return { conversationId: convId };
}

/**
 * Check if member is active participant in conversation.
 */
export async function isMemberInConversation(
  conversationId: string,
  memberId: number,
): Promise<boolean> {
  const result = await dbQuery(
    `SELECT 1 FROM conversation_participants
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  return result.rows.length > 0;
}

/**
 * Глобальная роль в приложении (`members.app_role`): администратор может управлять группами/каналами
 * даже без персонального флага «управление чатом» у участника.
 */
export async function isMemberAppAdministrator(memberId: number): Promise<boolean> {
  try {
    const result = await dbQuery(
      `SELECT LOWER(TRIM(COALESCE(app_role, ''))) AS r FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    return String(result.rows[0]?.r ?? '').trim() === 'admin';
  } catch {
    return false;
  }
}

/**
 * Get participant role in a conversation.
 */
export async function getParticipantRole(
  conversationId: string,
  memberId: number,
): Promise<ParticipantRole | null> {
  try {
    const result = await dbQuery(
      `SELECT role FROM conversation_participants
       WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL
       LIMIT 1`,
      [conversationId, memberId],
    );
    return (result.rows[0]?.role as ParticipantRole) ?? null;
  } catch (e) {
    if (!isPgUndefinedColumnError(e)) {
      throw e;
    }
    console.warn(
      '[messenger] getParticipantRole: retrying without left_at (column missing on older DB)',
      (e as Error)?.message,
    );
    const legacy = await dbQuery(
      `SELECT role FROM conversation_participants
       WHERE conversation_id = $1 AND member_id = $2
       LIMIT 1`,
      [conversationId, memberId],
    );
    return (legacy.rows[0]?.role as ParticipantRole) ?? null;
  }
}

/**
 * Get conversation type.
 */
export async function getConversationType(
  conversationId: string,
): Promise<ConversationType | null> {
  const result = await dbQuery(
    `SELECT type FROM conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  );
  return (result.rows[0]?.type as ConversationType) ?? null;
}

/**
 * Get active participant member IDs for a conversation.
 */
export async function getConversationMemberIds(conversationId: string): Promise<number[]> {
  const result = await dbQuery(
    `SELECT member_id FROM conversation_participants
     WHERE conversation_id = $1 AND left_at IS NULL`,
    [conversationId],
  );
  return result.rows.map((r) => Number(r.member_id));
}

/**
 * Get conversation participants with member info.
 */
export async function getConversationParticipants(conversationId: string) {
  const result = await dbQuery(
    `SELECT
       cp.member_id,
       cp.role,
       cp.joined_at,
       m.name,
       m.first_name,
       m.last_name
     FROM conversation_participants cp
     JOIN members m ON m.id = cp.member_id
     WHERE cp.conversation_id = $1 AND cp.left_at IS NULL
     ORDER BY cp.joined_at ASC`,
    [conversationId],
  );
  return result.rows;
}

/**
 * Add a member to a group/channel conversation.
 */
export async function addParticipant(
  conversationId: string,
  memberId: number,
  role: ParticipantRole = 'member',
): Promise<void> {
  await dbQuery(
    `INSERT INTO conversation_participants (conversation_id, member_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, member_id) DO UPDATE
     SET left_at = NULL, role = $3, joined_at = NOW()`,
    [conversationId, memberId, role],
  );
}

/**
 * Remove a member (soft-delete: set left_at).
 */
export async function removeParticipant(
  conversationId: string,
  memberId: number,
): Promise<void> {
  await dbQuery(
    `UPDATE conversation_participants SET left_at = NOW()
     WHERE conversation_id = $1 AND member_id = $2 AND left_at IS NULL`,
    [conversationId, memberId],
  );
}

/**
 * Update conversation title/avatar.
 */
export async function updateConversation(
  conversationId: string,
  updates: { title?: string; avatar_url?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(updates.title.trim());
  }
  if (updates.avatar_url !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    const av = updates.avatar_url;
    params.push(av === null || (typeof av === 'string' && av.trim() === '') ? null : av);
  }
  if (sets.length === 0) return;

  params.push(conversationId);
  await dbQuery(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = $${i}`,
    params,
  );
}

export type PrivateChatProfile = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  /** “Роль в проекте” */
  app_role: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null;
  last_seen_at: string | null;
};

export async function getPrivateChatProfile(
  conversationId: string,
  requesterMemberId: number,
): Promise<PrivateChatProfile | null> {
  const result = await dbQuery(
    `
    SELECT
      m.id,
      m.name,
      m.first_name,
      m.last_name,
      m.avatar_url,
      m.phone_number,
      m.app_role,
      m.ministry_role,
      m.ministry_direction,
      m.birth_date::text AS birth_date,
      m.last_seen_at
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    JOIN members m ON m.id = cp.member_id
    WHERE cp.conversation_id = $1
      AND cp.left_at IS NULL
      AND c.type = 'private'
      AND cp.member_id <> $2
    LIMIT 1
    `,
    [conversationId, requesterMemberId],
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    avatar_url: r.avatar_url ?? null,
    phone_number: r.phone_number ?? null,
    app_role: r.app_role ?? null,
    ministry_role: r.ministry_role ?? null,
    ministry_direction: r.ministry_direction ?? null,
    birth_date: coerceBirthDateToYmd(r.birth_date),
    last_seen_at:
      r.last_seen_at != null ? new Date(r.last_seen_at as string | Date).toISOString() : null,
  };
}

// ─── Messages ─────────────────────────────────────────────────

const MENTION_ID_WRAP = '\u2060';

/** Клиент: «@Имя» + невидимые U+2060 вокруг id, либо старый `@[Имя](id)`, либо уже `@[id]`. */
function normalizeFriendlyMentionsToCanonical(content: string): string {
  let s = content.replace(
    new RegExp(`@([^${MENTION_ID_WRAP}\n]+?)${MENTION_ID_WRAP}(\\d+)${MENTION_ID_WRAP}`, 'g'),
    (_m, _name, id) => {
      const digits = String(id).replace(/\D/g, '');
      return digits ? `@[${digits}]` : '';
    },
  );
  s = s.replace(/@\[([^\]]+)\]\((\d+)\)/g, (_m, _label, id) => {
    const digits = String(id).replace(/\D/g, '');
    return digits ? `@[${digits}]` : '';
  });
  return s;
}

/** После нормализации остаётся только `@[memberId]`. */
function extractMentionMemberIdsFromContent(content: string): number[] {
  const normalized = normalizeFriendlyMentionsToCanonical(content);
  if (!normalized) return [];
  const re = /@\[(\d+)\]/g;
  const ids: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)];
}

function normalizePayloadType(raw: unknown): MessagePayloadType {
  if (
    raw === 'prayer_request' ||
    raw === 'audio' ||
    raw === 'video_note' ||
    raw === 'image' ||
    raw === 'file' ||
    raw === 'poll' ||
    raw === 'access_request'
  ) {
    return raw;
  }
  return 'text';
}

function pollOptionsLength(payload: MessagePayload): number {
  const o = payload.options;
  return Array.isArray(o) ? o.length : 0;
}

/** Normalize and validate poll payload; `content` is the poll question. */
function normalizePollPayloadForSend(question: string, plRaw: MessagePayload): MessagePayload {
  const q = String(question ?? '').trim();
  if (!q || q.length > 500) {
    throw new Error('Poll question is required (max 500 characters)');
  }
  const optionsRaw = plRaw.options;
  if (!Array.isArray(optionsRaw)) {
    throw new Error('Poll requires payload.options as an array');
  }
  const options = optionsRaw
    .map((x) => String(x ?? '').trim())
    .filter((s) => s.length > 0);
  if (options.length < 2 || options.length > 10) {
    throw new Error('Poll must have between 2 and 10 non-empty options');
  }
  for (const o of options) {
    if (o.length > 200) throw new Error('Poll option too long (max 200 characters)');
  }
  return {
    options,
    allows_multiple: Boolean(plRaw.allows_multiple),
    anonymous: Boolean(plRaw.anonymous),
  };
}

function parseIntJsonArray(raw: unknown): number[] {
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function normalizePayload(raw: unknown): MessagePayload {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as MessagePayload;
  }
  return {};
}

function normalizeAttachmentUrl(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) throw new Error('Attachment URL is required');
  if (/^https?:\/\//i.test(input)) return input;
  if (/^\/\//.test(input)) return `https:${input}`;

  let normalized = input;
  if (normalized.startsWith('/api/messenger/public-uploads/')) {
    normalized = normalized.replace(/^\/api\/messenger\/public-uploads\//, '/uploads/');
  } else if (normalized.startsWith('/api/uploads/')) {
    normalized = normalized.replace(/^\/api\/uploads\//, '/uploads/');
  } else if (normalized.startsWith('api/uploads/')) {
    normalized = normalized.replace(/^api\/uploads\//, '/uploads/');
  }
  if (!normalized.startsWith('/uploads/')) {
    throw new Error(
      'Attachment URL must be absolute (https://...) or legacy /uploads/... path',
    );
  }
  return normalized;
}

function normalizeStorageObjectPath(raw: unknown): string | undefined {
  const input = String(raw ?? '').trim();
  if (!input) return undefined;
  const safe = input.replace(/^\/+/, '').replace(/\0/g, '');
  if (!safe || safe.includes('..') || safe.length > 512) return undefined;
  return safe;
}

function normalizeAttachmentPayloadForSend(plRaw: MessagePayload): MessagePayload {
  const url = normalizeAttachmentUrl(plRaw.url);
  const sizeNum = Number(plRaw.size ?? 0);
  const objectPath = normalizeStorageObjectPath(plRaw.objectPath ?? plRaw.object_path);
  return {
    ...plRaw,
    url,
    objectPath,
    name: String(plRaw.name ?? plRaw.filename ?? '').trim() || undefined,
    mimeType: String(plRaw.mimeType ?? '').trim() || undefined,
    size: Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : undefined,
  };
}

async function fetchMemberDisplayRow(memberId: number): Promise<{
  sender_name: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
}> {
  const r = await dbQuery(
    `SELECT name, first_name, last_name FROM members WHERE id = $1 LIMIT 1`,
    [memberId],
  );
  const row = r.rows[0];
  return {
    sender_name: row?.name?.trim() || null,
    sender_first_name: row?.first_name ?? null,
    sender_last_name: row?.last_name ?? null,
  };
}

async function fetchReplyPreviewForMessage(
  conversationId: string,
  replyToMessageId: string | null | undefined,
): Promise<MessageWithSender['reply_preview']> {
  if (!replyToMessageId || !/^\d+$/.test(String(replyToMessageId))) return null;
  const r = await dbQuery(
    `SELECT m.id, m.content, m.is_deleted,
            TRIM(COALESCE(mb.first_name, '') || ' ' || COALESCE(mb.last_name, '')) AS sender_name
     FROM messages m
     LEFT JOIN members mb ON mb.id = m.sender_id
     WHERE m.id = $1 AND m.conversation_id = $2
     LIMIT 1`,
    [replyToMessageId, conversationId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: bigint(row.id),
    content: decryptMessageText(String(row.content ?? '')),
    sender_name: row.sender_name?.trim() || null,
    is_deleted: row.is_deleted,
  };
}

/** Контекст после валидации + объект для немедленного fan-out по WebSocket (ещё без id в БД). */
export type PreparedMessageSend = {
  conversationId: string;
  senderId: number;
  contentStored: string;
  replyToMessageId: string | null;
  clientMsgId: string | null;
  pt: MessagePayloadType;
  payloadJson: string;
  isE2EE: boolean;
  encryptedPayload: string | null;
  pendingMessage: MessageWithSender;
};

/**
 * Валидация, упоминания, превью ответа и «конверт» с id `pending-<uuid>` для мгновенной доставки по WS.
 * Запись в БД — отдельно через `persistPreparedMessage`.
 */
export async function prepareMessageForSend(
  conversationId: string,
  senderId: number,
  content: string,
  replyToMessageId?: string | null,
  clientMsgId?: string | null,
  payloadType: MessagePayloadType = 'text',
  payload: MessagePayload = {},
): Promise<PreparedMessageSend> {
  const pt = normalizePayloadType(payloadType);
  const plRaw = normalizePayload(payload);
  const contentTrimmed = content.trim();
  const contentNormalized =
    pt === 'text' || pt === 'poll' ? normalizeChatDisplayText(contentTrimmed) : contentTrimmed;
  const contentStored = normalizeFriendlyMentionsToCanonical(contentNormalized);
  let pl: MessagePayload;
  if (pt === 'poll') {
    pl = normalizePollPayloadForSend(contentStored, plRaw);
  } else if (pt === 'image' || pt === 'file' || pt === 'audio' || pt === 'video_note') {
    pl = normalizeAttachmentPayloadForSend(plRaw);
  } else if (pt === 'text' && Object.keys(plRaw).length === 0) {
    pl = { text: contentStored };
  } else {
    pl = plRaw;
  }

  const mentionRaw = extractMentionMemberIdsFromContent(contentStored);
  if (mentionRaw.length > 0) {
    const memberSet = new Set(await getConversationMemberIds(conversationId));
    const valid = mentionRaw.filter((id) => memberSet.has(id) && id !== senderId);
    if (valid.length > 0) {
      pl = { ...pl, mention_member_ids: valid };
    }
  }

  pl = rewriteStorageUrlsInRecord(pl as Record<string, unknown>) as MessagePayload;

  const payloadJson = JSON.stringify(pl);
  const { isE2EE, encryptedPayload } = resolveE2EEFieldsFromPayload(pl);
  const replyNorm = replyToMessageId || null;
  const clientNorm = clientMsgId || null;

  const [senderDisp, reply_preview] = await Promise.all([
    fetchMemberDisplayRow(senderId),
    fetchReplyPreviewForMessage(conversationId, replyNorm),
  ]);

  const createdAt = new Date().toISOString();
  const pendingId = `pending-${randomUUID()}`;

  const pendingMessage: MessageWithSender = {
    id: pendingId,
    conversation_id: String(conversationId),
    sender_id: senderId,
    client_msg_id: clientNorm,
    content: contentStored,
    encrypted_payload: encryptedPayload,
    is_e2ee: isE2EE,
    payload_type: pt,
    payload: pl,
    interaction_count: 0,
    reply_to_message_id: replyNorm && /^\d+$/.test(String(replyNorm)) ? String(replyNorm) : null,
    forwarded_from: null,
    is_edited: false,
    is_deleted: false,
    is_pinned: false,
    created_at: createdAt,
    updated_at: createdAt,
    sender_name: senderDisp.sender_name,
    sender_first_name: senderDisp.sender_first_name,
    sender_last_name: senderDisp.sender_last_name,
    reply_preview,
    reactions: [],
  };

  if (pt === 'poll') {
    const optsLen = pollOptionsLength(pl);
    pendingMessage.poll_tallies = Array(Math.max(0, optsLen)).fill(0);
    pendingMessage.poll_my_options = [];
  }

  return {
    conversationId: String(conversationId),
    senderId,
    contentStored,
    replyToMessageId: replyNorm,
    clientMsgId: clientNorm,
    pt,
    payloadJson,
    isE2EE,
    encryptedPayload,
    pendingMessage,
  };
}

/**
 * Результат записи сообщения в БД.
 * `isNew === false` означает, что сработал `ON CONFLICT` по `client_msg_id`
 * (клиент ретраил тот же запрос) — уведомления (WS / push) уже были отправлены
 * при первой вставке, и повторно их слать нельзя.
 */
export type PersistMessageResult = {
  message: MessageWithSender;
  isNew: boolean;
};

/**
 * INSERT с идемпотентностью по `client_msg_id` + флаг «это свежая строка, а не
 * повторное UPDATE через ON CONFLICT». Флаг вычисляется через `xmax = 0`:
 * у свежевставленного кортежа `xmax = 0`, у обновлённого через ON CONFLICT
 * DO UPDATE — идентификатор текущей транзакции (ненулевой).
 */
export async function persistPreparedMessage(prep: PreparedMessageSend): Promise<PersistMessageResult> {
  const { conversationId, senderId, contentStored, replyToMessageId, clientMsgId, pt, payloadJson, isE2EE, encryptedPayload } = prep;
  const contentForDb = encryptMessageText(contentStored);

  await dbQuery(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

  const result = await dbQuery(
    `
    WITH inserted AS (
      INSERT INTO messages (conversation_id, sender_id, content, reply_to_message_id, client_msg_id, payload_type, payload, is_e2ee, encrypted_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      ON CONFLICT (conversation_id, sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL
      DO UPDATE SET
        content = EXCLUDED.content,
        payload_type = EXCLUDED.payload_type,
        payload = EXCLUDED.payload,
        is_e2ee = EXCLUDED.is_e2ee,
        encrypted_payload = EXCLUDED.encrypted_payload
      RETURNING *, (xmax = 0) AS is_new
    )
    SELECT
      ins.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = ins.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(ins.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = ins.id AND v.member_id = $10
      ) AS poll_my_options_json
    FROM inserted ins
    LEFT JOIN members m ON m.id = ins.sender_id
    LEFT JOIN messages rm ON rm.id = ins.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    `,
    [
      conversationId,
      senderId,
      contentForDb,
      replyToMessageId,
      clientMsgId,
      pt,
      payloadJson,
      isE2EE,
      encryptedPayload,
      senderId,
    ],
  );

  const row = result.rows[0];
  const isNew = row?.is_new === true;
  return { message: mapMessageWithSender(row), isNew };
}

/** Send a message. Returns the full message with sender info. */
export async function sendMessage(
  conversationId: string,
  senderId: number,
  content: string,
  replyToMessageId?: string | null,
  clientMsgId?: string | null,
  payloadType: MessagePayloadType = 'text',
  payload: MessagePayload = {},
): Promise<MessageWithSender> {
  const prep = await prepareMessageForSend(
    conversationId,
    senderId,
    content,
    replyToMessageId,
    clientMsgId,
    payloadType,
    payload,
  );
  const { message } = await persistPreparedMessage(prep);
  return message;
}

/**
 * Load messages for a conversation with cursor-based pagination.
 * Returns messages before `beforeId` (or latest if null).
 */
export async function loadMessages(
  conversationId: string,
  memberId: number,
  limit: number = 50,
  beforeId?: string | null,
): Promise<MessageWithSender[]> {
  const params: unknown[] = [conversationId, limit];
  /** Ключевой путь для индекса (conversation_id, created_at DESC): сортировка по времени, курсор через якорь. */
  let whereCursor = '';
  if (beforeId) {
    whereCursor = `AND EXISTS (
      SELECT 1 FROM messages anchor
      WHERE anchor.id = $3::bigint
        AND anchor.conversation_id = $1::bigint
        AND (msg.created_at, msg.id) < (anchor.created_at, anchor.id)
    )`;
    params.push(beforeId);
  }

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      -- reactions aggregated
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $${params.length + 1}) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = msg.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = msg.id AND v.member_id = $${params.length + 1}
      ) AS poll_my_options_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.conversation_id = $1::bigint ${whereCursor}
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT $2
    `,
    [...params, memberId],
  );

  return result.rows.map((r) => mapMessageWithSender(r)).reverse();
}

/**
 * Messages strictly newer than `afterId` (for reconnect catch-up). Chronological ascending.
 */
export async function loadMessagesAfter(
  conversationId: string,
  memberId: number,
  afterId: string,
  limit: number = 100,
): Promise<MessageWithSender[]> {
  const lim = Math.min(100, Math.max(1, limit));
  const params: unknown[] = [conversationId, lim, afterId];

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $${params.length + 1}) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = msg.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = msg.id AND v.member_id = $${params.length + 1}
      ) AS poll_my_options_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.conversation_id = $1 AND msg.id > $3
    ORDER BY msg.id ASC
    LIMIT $2
    `,
    [...params, memberId],
  );

  return result.rows.map((r) => mapMessageWithSender(r));
}

/**
 * Pinned messages (newest pin first), same shape as `loadMessages` rows.
 */
export async function listPinnedMessages(
  conversationId: string,
  memberId: number,
  limit: number = 15,
): Promise<MessageWithSender[]> {
  const lim = Math.min(30, Math.max(1, limit));
  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $2) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = msg.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = msg.id AND v.member_id = $2
      ) AS poll_my_options_json
    FROM chat_pins p
    JOIN messages msg ON msg.id = p.message_id
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE p.conversation_id = $1
      AND msg.is_deleted = FALSE
    ORDER BY p.pinned_at DESC
    LIMIT $3
    `,
    [conversationId, memberId, lim],
  );

  return result.rows.map((r) => mapMessageWithSender(r));
}

export async function pinMessageInConversation(
  conversationId: string,
  messageId: string,
  pinnedBy: number,
): Promise<void> {
  const mid = String(messageId || '').trim();
  if (!/^\d+$/.test(mid)) {
    throw new Error('Invalid message id');
  }
  const check = await dbQuery(
    `SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 AND is_deleted = FALSE LIMIT 1`,
    [mid, conversationId],
  );
  if (!check.rows[0]) {
    throw new Error('Message not found');
  }
  await dbQuery(
    `INSERT INTO chat_pins (conversation_id, message_id, pinned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, message_id) DO UPDATE SET pinned_at = NOW(), pinned_by = EXCLUDED.pinned_by`,
    [conversationId, mid, pinnedBy],
  );
  await dbQuery(`UPDATE messages SET is_pinned = TRUE WHERE id = $1`, [mid]);
}

export async function unpinMessageInConversation(conversationId: string, messageId: string): Promise<void> {
  const mid = String(messageId || '').trim();
  if (!/^\d+$/.test(mid)) {
    throw new Error('Invalid message id');
  }
  await dbQuery(`DELETE FROM chat_pins WHERE conversation_id = $1 AND message_id = $2`, [
    conversationId,
    mid,
  ]);
  await dbQuery(`UPDATE messages SET is_pinned = FALSE WHERE id = $1`, [mid]);
}

/** Для WS `msg:delivered_signal` с числовым `messageId`: сообщение в чате и от ожидаемого отправителя. */
export async function verifyMessageSenderInConversation(
  conversationId: string,
  messageId: string,
  expectedSenderId: number,
): Promise<boolean> {
  const mid = String(messageId || '').trim();
  if (!/^\d+$/.test(mid)) return false;
  const r = await dbQuery(
    `SELECT sender_id FROM messages WHERE id = $1 AND conversation_id = $2 AND is_deleted = FALSE LIMIT 1`,
    [mid, conversationId],
  );
  const sid = r.rows[0]?.sender_id;
  return sid != null && Number(sid) === Number(expectedSenderId);
}

/**
 * Edit message content (only by sender).
 */
export async function editMessage(
  messageId: string,
  senderId: number,
  newContent: string,
): Promise<{ content: string; updated_at: string } | null> {
  const sel = await dbQuery(
    `SELECT conversation_id, payload_type::text AS payload_type, payload
     FROM messages
     WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE`,
    [messageId, senderId],
  );
  const row = sel.rows[0] as
    | { conversation_id: string; payload_type: string; payload: unknown }
    | undefined;
  if (!row) return null;

  const convId = String(row.conversation_id);
  const pt = String(row.payload_type);
  const normalized = normalizeFriendlyMentionsToCanonical(
    normalizeChatDisplayText(newContent.trim()),
  );

  const mentionRaw = extractMentionMemberIdsFromContent(normalized);
  const memberSet = new Set(await getConversationMemberIds(convId));
  const valid = mentionRaw.filter((id) => memberSet.has(id) && id !== senderId);

  if (pt === 'text') {
    const pl: MessagePayload = {
      text: normalized,
      ...(valid.length ? { mention_member_ids: valid } : {}),
    };
    const payloadJson = JSON.stringify(pl);
    const contentForDb = encryptMessageText(normalized);
    const result = await dbQuery(
      `UPDATE messages
       SET content = $1, payload = $2::jsonb, is_e2ee = FALSE, encrypted_payload = NULL, updated_at = NOW()
       WHERE id = $3 AND sender_id = $4 AND is_deleted = FALSE
       RETURNING content, updated_at`,
      [contentForDb, payloadJson, messageId, senderId],
    );
    const rowUpdated = result.rows[0] as { content: string; updated_at: string } | undefined;
    if (!rowUpdated) return null;
    return { ...rowUpdated, content: decryptMessageText(String(rowUpdated.content ?? '')) };
  }

  const pl0 = normalizePayload(row.payload);
  const pl: MessagePayload = { ...pl0 };
  if (valid.length) pl.mention_member_ids = valid;
  else delete pl.mention_member_ids;
  const payloadJson = JSON.stringify(pl);
  const contentForDb = encryptMessageText(normalized);

  const result = await dbQuery(
    `UPDATE messages
     SET content = $1, payload = $2::jsonb, is_e2ee = FALSE, encrypted_payload = NULL, updated_at = NOW()
     WHERE id = $3 AND sender_id = $4 AND is_deleted = FALSE
     RETURNING content, updated_at`,
    [contentForDb, payloadJson, messageId, senderId],
  );
  const rowUpdated = result.rows[0] as { content: string; updated_at: string } | undefined;
  if (!rowUpdated) return null;
  return { ...rowUpdated, content: decryptMessageText(String(rowUpdated.content ?? '')) };
}

/**
 * Vote on a poll (or clear vote with empty `optionIndexes`). Replaces previous votes for this user.
 */
export async function votePollMessage(
  messageId: string,
  memberId: number,
  optionIndexes: number[],
): Promise<{ conversationId: string; tallies: number[]; my_options: number[] }> {
  const mid = String(messageId || '').trim();
  if (!/^\d+$/.test(mid)) {
    throw new Error('Invalid message id');
  }

  const rows = await dbQuery(
    `SELECT id, conversation_id, payload_type, payload, is_deleted FROM messages WHERE id = $1 LIMIT 1`,
    [mid],
  );
  const row = rows.rows[0];
  if (!row || row.is_deleted) {
    throw new Error('Message not found');
  }
  if (String(row.payload_type) !== 'poll') {
    throw new Error('Not a poll message');
  }

  const payload = normalizePayload(row.payload);
  const options = Array.isArray(payload.options) ? payload.options : [];
  const n = options.length;
  if (n < 2) {
    throw new Error('Invalid poll');
  }
  const allowsMultiple = Boolean(payload.allows_multiple);

  const uniq = [
    ...new Set(
      optionIndexes
        .map((i) => Number(i))
        .filter((i) => Number.isInteger(i) && i >= 0 && i < n),
    ),
  ].sort((a, b) => a - b);

  if (!allowsMultiple && uniq.length > 1) {
    throw new Error('This poll allows only one answer');
  }

  const convId = String(row.conversation_id);
  const ok = await isMemberInConversation(convId, memberId);
  if (!ok) {
    throw new Error('Forbidden');
  }

  await dbQuery(`DELETE FROM message_poll_votes WHERE message_id = $1 AND member_id = $2`, [mid, memberId]);
  for (const idx of uniq) {
    // eslint-disable-next-line no-await-in-loop
    await dbQuery(
      `INSERT INTO message_poll_votes (message_id, member_id, option_index) VALUES ($1, $2, $3)`,
      [mid, memberId, idx],
    );
  }

  const talliesRows = await dbQuery(
    `SELECT option_index, COUNT(*)::int AS c FROM message_poll_votes WHERE message_id = $1 GROUP BY option_index`,
    [mid],
  );
  const tallies = Array(n).fill(0);
  for (const tr of talliesRows.rows) {
    const i = Number((tr as { option_index: unknown }).option_index);
    const c = Number((tr as { c: unknown }).c);
    if (i >= 0 && i < n) tallies[i] = c;
  }

  return { conversationId: convId, tallies, my_options: uniq };
}

export type PollVoterDto = {
  member_id: number;
  display_name: string;
  avatar_url: string | null;
};

function pollVoterDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
}): string {
  const fl = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
  if (fl.length > 0) return fl;
  const n = String(row.name ?? '').trim();
  if (n.length > 0) return n;
  return 'Участник';
}

/**
 * List voters per option. For `anonymous` polls, voter identities are not returned.
 */
export async function getPollVotersForMember(
  messageId: string,
  memberId: number,
): Promise<{
  conversationId: string;
  anonymous: boolean;
  options: Array<{ index: number; voters: PollVoterDto[] }>;
}> {
  const mid = String(messageId || '').trim();
  if (!/^\d+$/.test(mid)) {
    throw new Error('Invalid message id');
  }

  const rows = await dbQuery(
    `SELECT id, conversation_id, payload_type, payload, is_deleted FROM messages WHERE id = $1 LIMIT 1`,
    [mid],
  );
  const row = rows.rows[0];
  if (!row || row.is_deleted) {
    throw new Error('Message not found');
  }
  if (String(row.payload_type) !== 'poll') {
    throw new Error('Not a poll message');
  }

  const payload = normalizePayload(row.payload);
  const optList = Array.isArray(payload.options) ? payload.options : [];
  const n = optList.length;
  if (n < 2) {
    throw new Error('Invalid poll');
  }

  const convId = String(row.conversation_id);
  const ok = await isMemberInConversation(convId, memberId);
  if (!ok) {
    throw new Error('Forbidden');
  }

  if (payload.anonymous) {
    return {
      conversationId: convId,
      anonymous: true,
      options: Array.from({ length: n }, (_, index) => ({ index, voters: [] as PollVoterDto[] })),
    };
  }

  const voteRows = await dbQuery(
    `SELECT v.option_index::int AS option_index,
            v.member_id::int AS member_id,
            mb.first_name,
            mb.last_name,
            mb.name,
            mb.avatar_url
     FROM message_poll_votes v
     INNER JOIN members mb ON mb.id = v.member_id
     WHERE v.message_id = $1
     ORDER BY v.option_index ASC,
              LOWER(TRIM(COALESCE(mb.first_name, '') || ' ' || COALESCE(mb.last_name, ''))) ASC,
              LOWER(TRIM(COALESCE(mb.name, ''))) ASC,
              v.member_id ASC`,
    [mid],
  );

  const buckets: PollVoterDto[][] = Array.from({ length: n }, () => []);
  for (const vr of voteRows.rows as Array<{
    option_index: number;
    member_id: number;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    avatar_url: string | null;
  }>) {
    const idx = Number(vr.option_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) continue;
    const avatarRaw = vr.avatar_url != null ? String(vr.avatar_url).trim() : '';
    buckets[idx].push({
      member_id: vr.member_id,
      display_name: pollVoterDisplayName(vr),
      avatar_url: avatarRaw.length > 0 ? avatarRaw : null,
    });
  }

  return {
    conversationId: convId,
    anonymous: false,
    options: buckets.map((voters, index) => ({ index, voters })),
  };
}

/**
 * Soft-delete a message (only by sender).
 */
export async function deleteMessage(
  messageId: string,
  senderId: number,
): Promise<boolean> {
  const result = await dbQuery(
    `UPDATE messages SET is_deleted = TRUE, content = ''
     WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE
     RETURNING id`,
    [messageId, senderId],
  );
  return result.rows.length > 0;
}

// ─── Read Receipts ────────────────────────────────────────────

/**
 * Mark messages as read up to a given message ID.
 * @returns false если строка не обновлена (сообщения нет в этом чате, участник вышел, гонка с кэшем) — не ошибка.
 */
export async function markRead(
  conversationId: string,
  memberId: number,
  input: { lastReadMessageId?: string | null; readAt?: string | null },
): Promise<boolean> {
  const normalizedMessageId = String(input.lastReadMessageId || '').trim();
  if (!normalizedMessageId) {
    return false;
  }
  const normalizedReadAt = String(input.readAt || '').trim();
  const hasMessageId = /^\d+$/.test(normalizedMessageId);
  const hasReadAt = normalizedReadAt.length > 0;
  if (!hasMessageId && !hasReadAt) {
    throw new Error('Invalid read marker');
  }
  if (hasMessageId) {
    const dedupKey = `${memberId}:${normalizedMessageId}`;
    const now = Date.now();
    const prev = recentMarkReadCalls.get(dedupKey);
    if (typeof prev === 'number' && now - prev < MARK_READ_DEDUP_WINDOW_MS) {
      return false;
    }
    recentMarkReadCalls.set(dedupKey, now);
  }

  const result = await dbQuery(
    `WITH target_message AS (
       SELECT id
       FROM messages
       WHERE conversation_id = $1::bigint
         AND (
           ($3::text <> '' AND id = $3::bigint)
           OR
           ($3::text = '' AND $4::timestamptz IS NOT NULL AND created_at <= $4::timestamptz)
         )
         AND payload_type::text NOT IN ('access_request', 'system', 'notification')
       ORDER BY id DESC
       LIMIT 1
     )
     UPDATE conversation_participants cp
     SET
       last_read_message_id = CASE
         WHEN cp.last_read_message_id IS NULL THEN (SELECT id FROM target_message)
         ELSE GREATEST(cp.last_read_message_id, (SELECT id FROM target_message))
       END
     WHERE cp.conversation_id = $1::bigint
       AND cp.member_id = $2
       AND cp.left_at IS NULL
       AND EXISTS (SELECT 1 FROM target_message)
     RETURNING cp.last_read_message_id`,
    [conversationId, memberId, hasMessageId ? normalizedMessageId : '', hasReadAt ? normalizedReadAt : null],
  );

  if (result.rows.length === 0) {
    console.debug('[messenger] markRead skipped (no matching message or not a participant)', {
      conversationId,
      memberId,
      messageId: hasMessageId ? normalizedMessageId : null,
      readAt: hasReadAt ? normalizedReadAt : null,
    });
    return false;
  }
  return true;
}

/**
 * Get total unread count across all conversations for a member.
 */
export async function getTotalUnreadCount(memberId: number): Promise<number> {
  return getUnreadMessagesCount(memberId);
}

// ─── Reactions ────────────────────────────────────────────────

export async function addReaction(
  messageId: string,
  memberId: number,
  emoji: string,
): Promise<boolean> {
  const cId = await getMessageConversationId(messageId);
  if (!cId) {
    throw new Error('Message not found');
  }
  const allowed = await isMemberInConversation(cId, memberId);
  if (!allowed) {
    throw new Error('Forbidden');
  }
  const result = await dbQuery(
    `INSERT INTO message_reactions (message_id, member_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING message_id`,
    [messageId, memberId, emoji],
  );
  return result.rows.length > 0;
}

export async function removeReaction(
  messageId: string,
  memberId: number,
  emoji: string,
): Promise<boolean> {
  const cId = await getMessageConversationId(messageId);
  if (!cId) {
    throw new Error('Message not found');
  }
  const allowed = await isMemberInConversation(cId, memberId);
  if (!allowed) {
    throw new Error('Forbidden');
  }
  const result = await dbQuery(
    `DELETE FROM message_reactions
     WHERE message_id = $1 AND member_id = $2 AND emoji = $3
     RETURNING message_id`,
    [messageId, memberId, emoji],
  );
  return result.rows.length > 0;
}

export async function getMessageConversationId(messageId: string): Promise<string | null> {
  const result = await dbQuery(
    `SELECT conversation_id FROM messages WHERE id = $1 LIMIT 1`,
    [messageId],
  );
  const raw = result.rows[0]?.conversation_id;
  return raw != null ? bigint(raw) : null;
}

export async function getMessageSenderId(messageId: string): Promise<number | null> {
  const result = await dbQuery(
    `SELECT sender_id FROM messages WHERE id = $1 LIMIT 1`,
    [messageId],
  );
  const raw = result.rows[0]?.sender_id;
  const senderId = Number(raw);
  return Number.isFinite(senderId) && senderId > 0 ? senderId : null;
}

export async function getMessageAttachmentForMember(
  messageId: string,
  memberId: number,
  slot?: number,
): Promise<{
  conversationId: string;
  url: string | null;
  objectPath?: string;
  fileName: string;
  mimeType: string | null;
} | null> {
  const result = await dbQuery(
    `SELECT conversation_id, payload_type::text AS payload_type, payload
     FROM messages
     WHERE id = $1
     LIMIT 1`,
    [messageId],
  );
  const row = result.rows[0] as
    | { conversation_id: string; payload_type: string; payload: unknown }
    | undefined;
  if (!row) return null;
  const conversationId = bigint(row.conversation_id);
  const allowed = await isMemberInConversation(conversationId, memberId);
  if (!allowed) {
    throw new Error('Forbidden');
  }
  const payloadType = String(row.payload_type);
  if (
    payloadType !== 'image' &&
    payloadType !== 'file' &&
    payloadType !== 'audio' &&
    payloadType !== 'video_note'
  )
    return null;
  const payload = normalizePayload(row.payload);

  let urlRaw = String(payload.url ?? '').trim();
  let objectPathRaw: unknown = payload.objectPath ?? payload.object_path;
  let fileName = String(payload.name ?? payload.filename ?? '').trim() || 'file';
  let mimeType =
    String(payload.mimeType ?? (payload as { mimetype?: unknown }).mimetype ?? '').trim() || null;

  if (mimeType) {
    const m = mimeType.toLowerCase();
    // Исторически в payload встречался audio/webm даже для video_note.
    // Нормализуем MIME по типу сообщения, чтобы браузер правильно выбирал декодер.
    if (payloadType === 'video_note' && m === 'audio/webm') mimeType = 'video/webm';
    if (payloadType === 'audio' && m === 'video/webm') mimeType = 'audio/webm';
  }

  const slotIdx =
    typeof slot === 'number' && Number.isFinite(slot) && slot >= 0 && slot <= 32 ? Math.floor(slot) : null;
  if (slotIdx != null && payloadType === 'image') {
    const images = Array.isArray(payload.images) ? payload.images : [];
    const imgRow = images[slotIdx];
    if (imgRow && typeof imgRow === 'object' && !Array.isArray(imgRow)) {
      const im = imgRow as Record<string, unknown>;
      const slotUrl = String(im.url ?? '').trim();
      const slotOp = im.objectPath ?? im.object_path;
      if (slotUrl || slotOp) {
        urlRaw = slotUrl;
        objectPathRaw = slotOp;
      }
      const slotName = String(im.name ?? im.filename ?? '').trim();
      if (slotName) fileName = slotName;
      const slotMime = String(im.mimeType ?? im.mimetype ?? '').trim();
      if (slotMime) mimeType = slotMime;
    }
  }

  const url = urlRaw
    ? rewriteSupabaseStorageUrlForClient(normalizeAttachmentUrl(urlRaw))
    : null;
  const objectPath = normalizeStorageObjectPath(objectPathRaw);
  if (!url && !objectPath) return null;
  return { conversationId, url, objectPath, fileName, mimeType };
}

export async function interactWithMessage(
  messageId: string,
  memberId: number,
  type: 'pray_click' = 'pray_click',
): Promise<{ interaction_count: number; conversation_id: string; inserted: boolean } | null> {
  const result = await dbQuery(
    `
    WITH ins AS (
      INSERT INTO message_interactions (message_id, member_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id, member_id) DO NOTHING
      RETURNING 1
    ),
    upd AS (
      UPDATE messages
      SET interaction_count = interaction_count + (SELECT COUNT(*) FROM ins)
      WHERE id = $1
      RETURNING interaction_count, conversation_id
    )
    SELECT
      COALESCE((SELECT interaction_count FROM upd), m.interaction_count)::int AS interaction_count,
      m.conversation_id,
      (SELECT COUNT(*) FROM ins) = 1 AS inserted
    FROM messages m
    WHERE m.id = $1
    LIMIT 1
    `,
    [messageId, memberId, type],
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    interaction_count: Number(r.interaction_count ?? 0),
    conversation_id: bigint(r.conversation_id),
    inserted: Boolean(r.inserted),
  };
}

// ─── Search members for new chat ──────────────────────────────

const MEMBER_SEARCH_SELECT = `
  m.id,
  m.name,
  m.first_name,
  m.last_name,
  m.avatar_url,
  m.last_seen_at,
  COALESCE(m.registration_status, 'active') AS registration_status,
  (m.password_hash IS NOT NULL) AS has_registered`;

const MEMBER_SEARCH_ORDER = `
  CASE COALESCE(m.registration_status, 'active')
    WHEN 'active' THEN 0
    WHEN 'pending_review' THEN 1
    ELSE 2
  END,
  (m.password_hash IS NOT NULL) DESC,
  m.name ASC`;

function mapMemberSearchRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    first_name: (r.first_name as string | null) ?? null,
    last_name: (r.last_name as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    last_seen_at:
      r.last_seen_at != null ? new Date(r.last_seen_at as string | Date).toISOString() : null,
    registration_status: String(r.registration_status ?? 'active'),
    has_registered: Boolean(r.has_registered),
  };
}

export async function searchMembers(
  searchTerm: string,
  excludeMemberId: number,
  limit: number = 20,
) {
  const result = await dbQuery(
    `SELECT ${MEMBER_SEARCH_SELECT}
     FROM members m
     WHERE m.is_active = TRUE
       AND m.id != $1
       AND (
         LOWER(m.name) LIKE '%' || LOWER($2) || '%'
         OR LOWER(COALESCE(m.first_name, '')) LIKE '%' || LOWER($2) || '%'
         OR LOWER(COALESCE(m.last_name, '')) LIKE '%' || LOWER($2) || '%'
       )
     ORDER BY ${MEMBER_SEARCH_ORDER}
     LIMIT $3`,
    [excludeMemberId, searchTerm.trim(), limit],
  );
  return result.rows.map((row) => mapMemberSearchRow(row as Record<string, unknown>));
}

/**
 * List church members for picker (for "new chat" list without search).
 */
export async function listRegisteredMembers(
  excludeMemberId: number,
  limit: number = 50,
) {
  const result = await dbQuery(
    `SELECT ${MEMBER_SEARCH_SELECT}
     FROM members m
     WHERE m.is_active = TRUE
       AND m.id != $1
     ORDER BY ${MEMBER_SEARCH_ORDER}
     LIMIT $2`,
    [excludeMemberId, limit],
  );
  return result.rows.map((row) => mapMemberSearchRow(row as Record<string, unknown>));
}

// ─── Канал «Заявки» (уведомления админам о регистрации) ───────

const ACCESS_REQUESTS_CHANNEL_KIND = 'access_requests';
const ACCESS_REQUESTS_CHANNEL_TITLE = 'Заявки';

/** Канал уведомлений админам о заявках на доступ (только системные сообщения). */
export function isMessengerAccessRequestsChannelMetadata(metadata: unknown): boolean {
  return (
    metadata != null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    String((metadata as Record<string, unknown>).kind ?? '') === ACCESS_REQUESTS_CHANNEL_KIND
  );
}
/** Для SELECT как у истории чата; для access_request блоки опроса пустые. */
const FANOUT_VIEWER_MEMBER_ID = 0;

async function fetchMessageByIdForFanout(messageId: string): Promise<MessageWithSender | null> {
  if (!/^\d+$/.test(messageId)) return null;
  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $2) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = msg.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = msg.id AND v.member_id = $2
      ) AS poll_my_options_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.id = $1::bigint
    LIMIT 1
    `,
    [messageId, FANOUT_VIEWER_MEMBER_ID],
  );
  const row = result.rows[0];
  return row ? mapMessageWithSender(row) : null;
}

async function syncAdminParticipantsToAccessRequestsChannel(conversationId: string): Promise<void> {
  const admins = await dbQuery(
    `SELECT id FROM members WHERE app_role = 'admin' AND COALESCE(is_active, TRUE)`,
  );
  for (const row of admins.rows) {
    const mId = Number((row as { id: unknown }).id);
    if (!Number.isFinite(mId)) continue;
    await addParticipant(conversationId, mId, 'member');
  }
}

/**
 * Создаёт канал «Заявки» и подписывает всех админов. Идемпотентно.
 */
export async function ensureAccessRequestsMessengerChannel(): Promise<string | null> {
  try {
    const found = await dbQuery(
      `SELECT id FROM conversations
       WHERE type = 'channel'
         AND metadata->>'kind' = $1
       LIMIT 1`,
      [ACCESS_REQUESTS_CHANNEL_KIND],
    );
    let convId: string;
    if (found.rows[0]?.id != null) {
      convId = bigint((found.rows[0] as { id: unknown }).id);
    } else {
      const ins = await dbQuery(
        `INSERT INTO conversations (type, title, metadata)
         VALUES ('channel', $1, $2::jsonb)
         RETURNING id`,
        [ACCESS_REQUESTS_CHANNEL_TITLE, JSON.stringify({ kind: ACCESS_REQUESTS_CHANNEL_KIND })],
      );
      convId = bigint((ins.rows[0] as { id: unknown }).id);
    }
    await syncAdminParticipantsToAccessRequestsChannel(convId);
    return convId;
  } catch (e) {
    console.error('[messenger] ensureAccessRequestsMessengerChannel:', e);
    return null;
  }
}

/**
 * Сообщение в канал о новой заявке на регистрацию (бот «Заявки», sender_id NULL).
 */
export async function postRegistrationAccessRequestMessengerNotification(input: {
  accessRequestId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber: string;
}): Promise<void> {
  const convId = await ensureAccessRequestsMessengerChannel();
  if (!convId) return;

  const content = `Новая заявка: ${input.fullName}`.trim();
  const contentForDb = encryptMessageText(content);
  const payload: MessagePayload = {
    access_request_id: input.accessRequestId,
    kind: 'registration',
    first_name: input.firstName,
    last_name: input.lastName,
    full_name: input.fullName,
    phone_number: input.phoneNumber,
  };

  await dbQuery(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

  const ins = await dbQuery(
    `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload)
     VALUES ($1::bigint, NULL, $2, 'access_request'::message_payload_type, $3::jsonb)
     RETURNING id`,
    [convId, contentForDb, JSON.stringify(payload)],
  );
  const rawId = (ins.rows[0] as { id?: unknown } | undefined)?.id;
  if (rawId == null) return;
  const messageId = bigint(rawId);

  const full = await fetchMessageByIdForFanout(messageId);
  if (!full) return;

  const { sendToRoomAll } = await import('../realtime/wsHub');
  sendToRoomAll(convId, {
    type: 'msg:new',
    conversationId: convId,
    message: { ...full, is_read: false as const },
  });

  try {
    const memberIds = await getConversationMemberIds(convId);
    const meta = await getConversationMeta(convId);
    const chatLabel = meta?.title?.trim() || ACCESS_REQUESTS_CHANNEL_TITLE;
    const previewShort =
      content.length > 160 ? `${content.slice(0, 157).trim()}…` : content;
    for (const rid of memberIds) {
      const r = Number(rid);
      if (!Number.isFinite(r)) continue;
      if (await isConversationMutedForMember(convId, r)) continue;
      await sendPushNotification(r, {
        title: chatLabel,
        body: previewShort,
        conversationId: convId,
        messageId,
        url: resolveMessengerConversationDeepLink(convId),
        tag: `chat-${convId}`,
        renotify: true,
        badge: '/assets/pwa-64x64.png',
        icon: '/assets/pwa-192x192.png',
        actions: [
          { action: 'reply', title: 'Ответить' },
          { action: 'dismiss', title: 'Закрыть' },
        ],
      });
    }
  } catch (e) {
    console.warn('[messenger] access-request push notify failed:', e);
  }
}

/**
 * После approve/reject в админке — обновить карточку в чате и разослать по WS.
 */
export async function markAccessRequestMessengerResolved(
  accessRequestId: number,
  resolution: 'approved' | 'rejected',
): Promise<void> {
  const upd = await dbQuery(
    `UPDATE messages
     SET
       payload = payload || jsonb_build_object('resolution', to_jsonb($2::text)),
       updated_at = NOW()
     WHERE payload_type = 'access_request'::message_payload_type
       AND (payload->>'access_request_id')::bigint = $1::bigint
     RETURNING id, conversation_id, payload, updated_at`,
    [accessRequestId, resolution],
  );
  const row = upd.rows[0] as
    | { id: unknown; conversation_id: unknown; payload: unknown; updated_at: string }
    | undefined;
  if (!row?.id || row.conversation_id == null) return;

  const messageId = bigint(row.id);
  const convId = bigint(row.conversation_id);
  const payloadObj =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  const { sendToRoomAll } = await import('../realtime/wsHub');
  sendToRoomAll(convId, {
    type: 'msg:payload_updated',
    conversationId: convId,
    messageId,
    payload: payloadObj,
    updatedAt: row.updated_at,
  });
}

// ─── Map helper ───────────────────────────────────────────────

function mapMessageWithSender(r: Record<string, unknown>): MessageWithSender {
  const asString = (v: unknown): string => (v == null ? '' : String(v));
  const asNullableString = (v: unknown): string | null => (v == null ? null : String(v));
  const asBoolean = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
  const asNumberOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  let reactions: MessageWithSender['reactions'] = [];
  if (r.reactions_json) {
    try {
      const parsed = typeof r.reactions_json === 'string'
        ? JSON.parse(r.reactions_json)
        : r.reactions_json;
      if (Array.isArray(parsed)) {
        reactions = parsed;
      }
    } catch { /* ignore */ }
  }

  const payloadNorm = rewriteStorageUrlsInRecord(
    normalizePayload(r.payload) as Record<string, unknown>,
  ) as MessagePayload;
  const pt = normalizePayloadType(r.payload_type);

  const contentResolved = decryptMessageText(asString(r.content));
  const replyContentResolved = decryptMessageText(asString(r.rp_content));

  const base: MessageWithSender = {
    id: bigint(r.id),
    conversation_id: bigint(r.conversation_id),
    sender_id: asNumberOrNull(r.sender_id),
    client_msg_id: asNullableString(r.client_msg_id),
    content: contentResolved,
    encrypted_payload: asNullableString(r.encrypted_payload),
    is_e2ee: asBoolean(r.is_e2ee),
    payload_type: pt,
    payload: payloadNorm,
    interaction_count: Number(r.interaction_count ?? 0),
    reply_to_message_id: r.reply_to_message_id ? bigint(r.reply_to_message_id) : null,
    forwarded_from: asNullableString(r.forwarded_from),
    is_edited: asBoolean(r.is_edited),
    is_deleted: asBoolean(r.is_deleted),
    is_pinned: asBoolean(r.is_pinned),
    created_at: asString(r.created_at),
    updated_at: asString(r.updated_at),
    sender_name: asNullableString(r.sender_name)?.trim() || (pt === 'access_request' ? 'Заявки' : null),
    sender_first_name: asNullableString(r.sender_first_name),
    sender_last_name: asNullableString(r.sender_last_name),
    reply_preview: r.rp_id
      ? {
          id: bigint(r.rp_id),
          content: replyContentResolved,
          sender_name: asNullableString(r.rp_sender_name)?.trim() || null,
          is_deleted: asBoolean(r.rp_is_deleted),
        }
      : null,
    reactions,
  };

  if (pt === 'poll') {
    const optsLen = pollOptionsLength(payloadNorm);
    let tallies = parseIntJsonArray(r.poll_tallies_json);
    if (tallies.length !== optsLen) {
      tallies = Array(Math.max(0, optsLen)).fill(0);
    }
    base.poll_tallies = tallies;
    base.poll_my_options = parseIntJsonArray(r.poll_my_options_json);
  }

  return base;
}

/**
 * Search messages in a conversation by content.
 */
export async function searchMessages(
  conversationId: string,
  searchQuery: string,
  memberId: number,
  limit: number = 50,
): Promise<MessageWithSender[]> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (isMessageEncryptionEnabled()) {
    const candidateLimit = Math.min(Math.max(limit * 12, 300), 1500);
    const result = await dbQuery(
      `
      SELECT
        msg.*,
        m.name        AS sender_name,
        m.first_name  AS sender_first_name,
        m.last_name   AS sender_last_name,
        rm.id         AS rp_id,
        rm.content    AS rp_content,
        rm.is_deleted AS rp_is_deleted,
        COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'emoji', r.emoji,
            'count', r.cnt,
            'reacted_by_me', r.my_react
          )), '[]'::json)
          FROM (
            SELECT
              mr.emoji,
              COUNT(*)::int AS cnt,
              BOOL_OR(mr.member_id = $2) AS my_react
            FROM message_reactions mr
            WHERE mr.message_id = msg.id
            GROUP BY mr.emoji
          ) r
        ) AS reactions_json,
        (
          SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
          FROM (
            SELECT gs.i AS i,
              COALESCE((
                SELECT COUNT(*)::int FROM message_poll_votes v
                WHERE v.message_id = msg.id AND v.option_index = gs.i
              ), 0) AS c
            FROM generate_series(
              0,
              GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
            ) AS gs(i)
          ) sub
        ) AS poll_tallies_json,
        (
          SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
          FROM message_poll_votes v
          WHERE v.message_id = msg.id AND v.member_id = $2
        ) AS poll_my_options_json
      FROM messages msg
      LEFT JOIN members m ON m.id = msg.sender_id
      LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
      LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
      WHERE msg.conversation_id = $1
        AND msg.is_deleted = FALSE
      ORDER BY msg.created_at DESC
      LIMIT $3
      `,
      [conversationId, memberId, candidateLimit],
    );

    return result.rows
      .map((r) => mapMessageWithSender(r))
      .filter((msg) => msg.content.toLowerCase().includes(normalizedQuery))
      .slice(0, limit);
  }

  const searchTerm = `%${searchQuery.trim()}%`;

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      -- reactions aggregated
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $3) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      (
        SELECT COALESCE(json_agg(sub.c ORDER BY sub.i), '[]'::json)
        FROM (
          SELECT gs.i AS i,
            COALESCE((
              SELECT COUNT(*)::int FROM message_poll_votes v
              WHERE v.message_id = msg.id AND v.option_index = gs.i
            ), 0) AS c
          FROM generate_series(
            0,
            GREATEST(0, jsonb_array_length(COALESCE(msg.payload->'options', '[]'::jsonb)) - 1)
          ) AS gs(i)
        ) sub
      ) AS poll_tallies_json,
      (
        SELECT COALESCE(json_agg(v.option_index ORDER BY v.option_index), '[]'::json)
        FROM message_poll_votes v
        WHERE v.message_id = msg.id AND v.member_id = $3
      ) AS poll_my_options_json
    FROM messages msg
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.conversation_id = $1
      AND msg.is_deleted = FALSE
      AND msg.content ILIKE $2
    ORDER BY msg.created_at DESC
    LIMIT $4
    `,
    [conversationId, searchTerm, memberId, limit],
  );

  return result.rows.map((r) => mapMessageWithSender(r));
}

/**
 * Global search across ALL conversations the user is a member of.
 * Returns messages with a `conversationTitle` field.
 */
export async function searchAllMessages(
  searchQuery: string,
  memberId: number,
  limit: number = 30,
): Promise<Array<ReturnType<typeof mapMessageWithSender> & { conversationTitle: string }>> {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (isMessageEncryptionEnabled()) {
    const candidateLimit = Math.min(Math.max(limit * 18, 400), 2000);
    const result = await dbQuery(
      `
      SELECT
        msg.*,
        m.name        AS sender_name,
        m.first_name  AS sender_first_name,
        m.last_name   AS sender_last_name,
        COALESCE(c.title, 'Чат') AS conv_title,
        rm.id         AS rp_id,
        rm.content    AS rp_content,
        rm.is_deleted AS rp_is_deleted,
        COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'emoji', r.emoji,
            'count', r.cnt,
            'reacted_by_me', r.my_react
          )), '[]'::json)
          FROM (
            SELECT
              mr.emoji,
              COUNT(*)::int AS cnt,
              BOOL_OR(mr.member_id = $2) AS my_react
            FROM message_reactions mr
            WHERE mr.message_id = msg.id
            GROUP BY mr.emoji
          ) r
        ) AS reactions_json,
        '[]'::json AS poll_tallies_json,
        '[]'::json AS poll_my_options_json
      FROM messages msg
      JOIN conversation_members cm ON cm.conversation_id = msg.conversation_id AND cm.member_id = $2
      JOIN conversations c ON c.id = msg.conversation_id
      LEFT JOIN members m ON m.id = msg.sender_id
      LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
      LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
      WHERE msg.is_deleted = FALSE
      ORDER BY msg.created_at DESC
      LIMIT $1
      `,
      [candidateLimit, memberId],
    );

    return result.rows
      .map((r) => ({
        ...mapMessageWithSender(r),
        conversationTitle: r.conv_title || 'Чат',
      }))
      .filter((msg) => msg.content.toLowerCase().includes(normalizedQuery))
      .slice(0, limit);
  }

  const searchTerm = `%${searchQuery.trim()}%`;

  const result = await dbQuery(
    `
    SELECT
      msg.*,
      m.name        AS sender_name,
      m.first_name  AS sender_first_name,
      m.last_name   AS sender_last_name,
      -- conversation title
      COALESCE(c.title, 'Чат') AS conv_title,
      -- reply preview
      rm.id         AS rp_id,
      rm.content    AS rp_content,
      rm.is_deleted AS rp_is_deleted,
      COALESCE(rm_s.first_name, '') || ' ' || COALESCE(rm_s.last_name, '') AS rp_sender_name,
      -- reactions aggregated
      (
        SELECT COALESCE(json_agg(json_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'reacted_by_me', r.my_react
        )), '[]'::json)
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS cnt,
            BOOL_OR(mr.member_id = $2) AS my_react
          FROM message_reactions mr
          WHERE mr.message_id = msg.id
          GROUP BY mr.emoji
        ) r
      ) AS reactions_json,
      '[]'::json AS poll_tallies_json,
      '[]'::json AS poll_my_options_json
    FROM messages msg
    JOIN conversation_members cm ON cm.conversation_id = msg.conversation_id AND cm.member_id = $2
    JOIN conversations c ON c.id = msg.conversation_id
    LEFT JOIN members m ON m.id = msg.sender_id
    LEFT JOIN messages rm ON rm.id = msg.reply_to_message_id
    LEFT JOIN members rm_s ON rm_s.id = rm.sender_id
    WHERE msg.is_deleted = FALSE
      AND msg.content ILIKE $1
    ORDER BY msg.created_at DESC
    LIMIT $3
    `,
    [searchTerm, memberId, limit],
  );

  return result.rows.map((r) => ({
    ...mapMessageWithSender(r),
    conversationTitle: r.conv_title || 'Чат',
  }));
}
