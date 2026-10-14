import {query} from '../config/db';

export type MemberPushPrefs = {
  memberId: number;
  messagesEnabled: boolean;
  callsEnabled: boolean;
  systemEnabled: boolean;
  dndEnabled: boolean;
  dndStartMinute: number;
  dndEndMinute: number;
  timezone: string;
};

const DEFAULTS: Omit<MemberPushPrefs, 'memberId'> = {
  messagesEnabled: true,
  callsEnabled: true,
  systemEnabled: true,
  dndEnabled: false,
  dndStartMinute: 1320,
  dndEndMinute: 480,
  timezone: 'Europe/Moscow',
};

async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS member_push_prefs (
      member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
      messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      calls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      dnd_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      dnd_start_minute SMALLINT NOT NULL DEFAULT 1320,
      dnd_end_minute SMALLINT NOT NULL DEFAULT 480,
      timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function minuteOfDayInTz(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function inDndWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  // wraps midnight
  return minute >= start || minute < end;
}

export async function getMemberPushPrefs(memberId: number): Promise<MemberPushPrefs> {
  await ensureTable();
  const res = await query(`SELECT * FROM member_push_prefs WHERE member_id = $1 LIMIT 1`, [memberId]);
  const row = res.rows[0];
  if (!row) return {memberId, ...DEFAULTS};
  return {
    memberId,
    messagesEnabled: Boolean(row.messages_enabled),
    callsEnabled: Boolean(row.calls_enabled),
    systemEnabled: Boolean(row.system_enabled),
    dndEnabled: Boolean(row.dnd_enabled),
    dndStartMinute: Number(row.dnd_start_minute ?? DEFAULTS.dndStartMinute),
    dndEndMinute: Number(row.dnd_end_minute ?? DEFAULTS.dndEndMinute),
    timezone: String(row.timezone ?? DEFAULTS.timezone),
  };
}

export async function upsertMemberPushPrefs(
  memberId: number,
  patch: Partial<Omit<MemberPushPrefs, 'memberId'>>,
): Promise<MemberPushPrefs> {
  await ensureTable();
  const current = await getMemberPushPrefs(memberId);
  const next = {...current, ...patch, memberId};
  await query(
    `INSERT INTO member_push_prefs (
       member_id, messages_enabled, calls_enabled, system_enabled,
       dnd_enabled, dnd_start_minute, dnd_end_minute, timezone, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (member_id) DO UPDATE SET
       messages_enabled = EXCLUDED.messages_enabled,
       calls_enabled = EXCLUDED.calls_enabled,
       system_enabled = EXCLUDED.system_enabled,
       dnd_enabled = EXCLUDED.dnd_enabled,
       dnd_start_minute = EXCLUDED.dnd_start_minute,
       dnd_end_minute = EXCLUDED.dnd_end_minute,
       timezone = EXCLUDED.timezone,
       updated_at = NOW()`,
    [
      memberId,
      next.messagesEnabled,
      next.callsEnabled,
      next.systemEnabled,
      next.dndEnabled,
      next.dndStartMinute,
      next.dndEndMinute,
      next.timezone,
    ],
  );
  return next;
}

export type PushKind = 'message' | 'call' | 'system';

/**
 * Returns false when the push should be suppressed (channel off or DND).
 * Calls always bypass DND when calls_enabled (user expectation for ringing).
 */
export async function shouldDeliverPush(memberId: number, kind: PushKind): Promise<boolean> {
  const prefs = await getMemberPushPrefs(memberId);
  if (kind === 'message' && !prefs.messagesEnabled) return false;
  if (kind === 'call' && !prefs.callsEnabled) return false;
  if (kind === 'system' && !prefs.systemEnabled) return false;
  if (kind === 'call') return true;
  if (!prefs.dndEnabled) return true;
  const minute = minuteOfDayInTz(new Date(), prefs.timezone);
  return !inDndWindow(minute, prefs.dndStartMinute, prefs.dndEndMinute);
}
