import { query as dbQuery } from '../config/db';
import {
  buildMessengerQrPayload,
  generateMessengerAccountId,
  isValidMessengerAccountId,
  messengerSessionDeepLinkPath,
  normalizeMessengerAccountId,
  type MessengerQrPayloadV1,
} from '../lib/messengerAccountId';
import { isMemberOnline } from '../realtime/wsHub';

export type MessengerIdentity = {
  member_id: number;
  account_id: string;
  public_key: string | null;
  qr_payload: MessengerQrPayloadV1;
  qr_path: string;
};

export type MessengerAccountContact = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  registration_status: string;
  has_registered: boolean;
  messenger_account_id: string;
  public_key: string | null;
  is_online?: boolean;
};

async function fetchMemberIdentityRow(memberId: number): Promise<{
  id: number;
  messenger_account_id: string | null;
  public_key: string | null;
} | null> {
  const result = await dbQuery(
    `SELECT id, messenger_account_id, public_key
     FROM members
     WHERE id = $1
     LIMIT 1`,
    [memberId],
  );
  const row = result.rows[0] as
    | { id?: unknown; messenger_account_id?: unknown; public_key?: unknown }
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    messenger_account_id:
      typeof row.messenger_account_id === 'string' && row.messenger_account_id.trim()
        ? row.messenger_account_id.trim()
        : null,
    public_key:
      typeof row.public_key === 'string' && row.public_key.trim() ? row.public_key.trim() : null,
  };
}

/**
 * Ensure member has a Session-like messenger_account_id.
 * Optionally persist client E2EE public key (SPKI/JWK string).
 */
export async function ensureMessengerIdentity(
  memberId: number,
  opts?: { publicKey?: string | null },
): Promise<MessengerIdentity> {
  if (!Number.isFinite(memberId) || memberId <= 0) {
    throw new Error('Invalid member id');
  }
  const existing = await fetchMemberIdentityRow(memberId);
  if (!existing) throw new Error('Member not found');

  let accountId = existing.messenger_account_id;
  let publicKey = existing.public_key;

  const nextPublicKey =
    typeof opts?.publicKey === 'string' && opts.publicKey.trim()
      ? opts.publicKey.trim().slice(0, 16384)
      : null;

  if (!accountId) {
    // Allocate unique id (retry on rare collision).
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateMessengerAccountId();
      try {
        const updated = await dbQuery(
          `UPDATE members
           SET messenger_account_id = $2,
               public_key = COALESCE($3, public_key),
               updated_at = NOW()
           WHERE id = $1
             AND messenger_account_id IS NULL
           RETURNING messenger_account_id, public_key`,
          [memberId, candidate, nextPublicKey],
        );
        const row = updated.rows[0] as
          | { messenger_account_id?: unknown; public_key?: unknown }
          | undefined;
        if (row?.messenger_account_id) {
          accountId = String(row.messenger_account_id);
          publicKey =
            typeof row.public_key === 'string' && row.public_key.trim()
              ? row.public_key.trim()
              : publicKey;
          break;
        }
        // Race: another request set the id.
        const again = await fetchMemberIdentityRow(memberId);
        if (again?.messenger_account_id) {
          accountId = again.messenger_account_id;
          publicKey = again.public_key;
          break;
        }
      } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : '';
        if (code !== '23505') throw e;
      }
    }
  } else if (nextPublicKey && nextPublicKey !== publicKey) {
    const updated = await dbQuery(
      `UPDATE members
       SET public_key = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING public_key`,
      [memberId, nextPublicKey],
    );
    const row = updated.rows[0] as { public_key?: unknown } | undefined;
    publicKey =
      typeof row?.public_key === 'string' && row.public_key.trim()
        ? row.public_key.trim()
        : nextPublicKey;
  }

  if (!accountId || !isValidMessengerAccountId(accountId)) {
    throw new Error('Failed to allocate messenger account id');
  }

  const normalized = normalizeMessengerAccountId(accountId)!;
  return {
    member_id: memberId,
    account_id: normalized,
    public_key: publicKey,
    qr_payload: buildMessengerQrPayload(normalized),
    qr_path: messengerSessionDeepLinkPath(normalized),
  };
}

export async function getMessengerIdentity(memberId: number): Promise<MessengerIdentity> {
  return ensureMessengerIdentity(memberId);
}

export async function resolveMemberByMessengerAccountId(
  accountIdRaw: string,
  viewerMemberId: number,
): Promise<MessengerAccountContact | null> {
  const accountId = normalizeMessengerAccountId(accountIdRaw);
  if (!accountId) return null;
  const result = await dbQuery(
    `SELECT
       m.id,
       m.name,
       m.first_name,
       m.last_name,
       m.avatar_url,
       m.last_seen_at,
       COALESCE(m.registration_status, 'active') AS registration_status,
       (m.password_hash IS NOT NULL) AS has_registered,
       m.messenger_account_id,
       m.public_key
     FROM members m
     WHERE m.is_active = TRUE
       AND m.messenger_account_id = $1
       AND COALESCE(NULLIF(TRIM(m.registration_status), ''), 'active') = 'active'
     LIMIT 1`,
    [accountId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (id === viewerMemberId) return null;
  return {
    id,
    name: String(row.name ?? ''),
    first_name: (row.first_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    last_seen_at:
      row.last_seen_at != null ? new Date(row.last_seen_at as string | Date).toISOString() : null,
    registration_status: String(row.registration_status ?? 'active'),
    has_registered: Boolean(row.has_registered),
    messenger_account_id: accountId,
    public_key:
      typeof row.public_key === 'string' && row.public_key.trim() ? row.public_key.trim() : null,
    is_online: isMemberOnline(id),
  };
}
