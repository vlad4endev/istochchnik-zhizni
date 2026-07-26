import { parse } from 'date-fns';

import type {
  EditableServicePlanMetaPayload,
  EditableServicePlanPayload,
  LinkedSermonNoteSummary,
  PublicBroadcastAssignment,
  PublicServicePlanPayload,
} from './api';

type PlannerBlockKind = EditableServicePlanMetaPayload['block_types'][number]['kind'];

function normalizeOptionalPositiveInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function coercePlannerBlockKind(kind: unknown): PlannerBlockKind {
  if (kind === 'song' || kind === 'text' || kind === 'speaker' || kind === 'custom') return kind;
  return 'custom';
}

/** Безопасный объект для `content_json` (сервер/кэш могут вернуть null или не объект). */
export function asPlainContentJson(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeBroadcastAssignments(raw: unknown): PublicBroadcastAssignment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const role_name = typeof item.role_name === 'string' ? item.role_name.trim() : '';
      const member_name = typeof item.member_name === 'string' ? item.member_name.trim() : '';
      if (!role_name || !member_name) return null;
      const role_color =
        typeof item.role_color === 'string' && item.role_color.trim() ? item.role_color.trim() : '#6366f1';
      return { role_name, role_color, member_name };
    })
    .filter((x): x is PublicBroadcastAssignment => x != null);
}

function normalizeLinkedSermonNote(raw: unknown): LinkedSermonNoteSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = item.id == null ? '' : String(item.id);
  if (!id) return null;
  return {
    id,
    title: typeof item.title === 'string' ? item.title : '',
    topic: typeof item.topic === 'string' ? item.topic : '',
    scripture: typeof item.scripture === 'string' ? item.scripture : '',
    member_id: Number(item.member_id) || 0,
    author_name: item.author_name == null ? null : String(item.author_name),
    is_public: Boolean(item.is_public),
    share_token: item.share_token == null || item.share_token === '' ? null : String(item.share_token),
    updated_at: typeof item.updated_at === 'string' ? item.updated_at : '',
  };
}

export function normalizePublicServicePlanPayload(raw: PublicServicePlanPayload): PublicServicePlanPayload {
  const plan = raw?.plan ?? ({} as PublicServicePlanPayload['plan']);
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  return {
    ...raw,
    plan: {
      ...plan,
      id: Number(plan.id) || 0,
      service_date: typeof plan.service_date === 'string' ? plan.service_date : '',
      start_time: typeof plan.start_time === 'string' && plan.start_time.trim() ? plan.start_time : '10:00',
      status: plan.status === 'published' ? 'published' : 'draft',
      total_duration_minutes: Math.max(0, Number(plan.total_duration_minutes) || 0),
      notes: plan.notes == null ? null : String(plan.notes),
      share_token: String(plan.share_token ?? ''),
      template_name: plan.template_name == null ? null : String(plan.template_name),
      leader_name: plan.leader_name == null ? null : String(plan.leader_name),
      preacher_name: plan.preacher_name == null ? null : String(plan.preacher_name),
    },
    broadcast_assignments: normalizeBroadcastAssignments(raw?.broadcast_assignments),
    linked_sermon_note: normalizeLinkedSermonNote(
      (raw as PublicServicePlanPayload | undefined)?.linked_sermon_note,
    ),
    blocks: blocks.map((b) => ({
      ...b,
      id: Number(b.id) || 0,
      order_index: Number(b.order_index) || 0,
      title: typeof b.title === 'string' ? b.title : '',
      duration_minutes: Math.max(0, Number(b.duration_minutes) || 0),
      block_type_name: b.block_type_name == null ? null : String(b.block_type_name),
      block_type_code: b.block_type_code == null ? null : String(b.block_type_code),
      assigned_member_name: b.assigned_member_name == null ? null : String(b.assigned_member_name),
      song_title: b.song_title == null ? null : String(b.song_title),
      song_key: b.song_key == null ? null : String(b.song_key),
      content_json: asPlainContentJson(b.content_json),
    })),
  };
}

export function normalizeEditableServicePlanPayload(raw: EditableServicePlanPayload): EditableServicePlanPayload {
  const plan = raw?.plan ?? ({} as EditableServicePlanPayload['plan']);
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
  return {
    ...raw,
    plan: {
      ...plan,
      id: Number(plan.id) || 0,
      service_date: typeof plan.service_date === 'string' ? plan.service_date : '',
      start_time: typeof plan.start_time === 'string' && plan.start_time.trim() ? plan.start_time : '10:00',
      status: plan.status === 'published' ? 'published' : 'draft',
      total_duration_minutes: Math.max(0, Number(plan.total_duration_minutes) || 0),
      notes: plan.notes == null ? null : String(plan.notes),
      edit_token: String(plan.edit_token ?? ''),
      template_name: plan.template_name == null ? null : String(plan.template_name),
      leader_name: plan.leader_name == null ? null : String(plan.leader_name),
      preacher_member_id: normalizeOptionalPositiveInt(plan.preacher_member_id),
      preacher_name: plan.preacher_name == null ? null : String(plan.preacher_name),
      music_ministry_member_id: normalizeOptionalPositiveInt(plan.music_ministry_member_id),
      music_ministry_name: plan.music_ministry_name == null ? null : String(plan.music_ministry_name),
    },
    broadcast_assignments: normalizeBroadcastAssignments(raw?.broadcast_assignments),
    linked_sermon_note: normalizeLinkedSermonNote(
      (raw as EditableServicePlanPayload | undefined)?.linked_sermon_note,
    ),
    blocks: blocks.map((b) => ({
      ...b,
      id: Number(b.id) || 0,
      block_type_id: Number(b.block_type_id) || 0,
      order_index: Number(b.order_index) || 0,
      title: typeof b.title === 'string' ? b.title : '',
      duration_minutes: Math.max(1, Math.min(180, Number(b.duration_minutes) || 5)),
      assigned_member_id: normalizeOptionalPositiveInt(b.assigned_member_id),
      song_id: normalizeOptionalPositiveInt(b.song_id),
      block_type_name: b.block_type_name == null ? null : String(b.block_type_name),
      block_type_code: b.block_type_code == null ? null : String(b.block_type_code),
      assigned_member_name: b.assigned_member_name == null ? null : String(b.assigned_member_name),
      song_title: b.song_title == null ? null : String(b.song_title),
      song_key: b.song_key == null ? null : String(b.song_key),
      content_json: asPlainContentJson(b.content_json),
    })),
  };
}

export function normalizeEditableServicePlanMeta(raw: EditableServicePlanMetaPayload): EditableServicePlanMetaPayload {
  const block_types = Array.isArray(raw?.block_types) ? raw.block_types : [];
  const members = Array.isArray(raw?.members) ? raw.members : [];
  const songs = Array.isArray(raw?.songs) ? raw.songs : [];
  return {
    block_types: block_types
      .map((t) => ({
        id: Number(t.id) || 0,
        code: String(t.code ?? ''),
        name: String(t.name ?? ''),
        kind: coercePlannerBlockKind(t.kind),
      }))
      .filter((t) => t.id > 0),
    members: members
      .map((m) => ({
        id: Number(m.id) || 0,
        first_name: m.first_name == null ? null : String(m.first_name),
        last_name: m.last_name == null ? null : String(m.last_name),
        name: String(m.name ?? ''),
        ministry_role: m.ministry_role == null ? null : String(m.ministry_role),
        ministry_direction: m.ministry_direction == null ? null : String(m.ministry_direction),
        app_role: String(m.app_role ?? 'member'),
      }))
      .filter((m) => m.id > 0),
    songs: songs
      .map((s) => ({
        id: Number(s.id) || 0,
        title: typeof s.title === 'string' ? s.title : '',
        default_key: s.default_key == null ? null : String(s.default_key),
      }))
      .filter((s) => s.id > 0),
  };
}

/** Стартовое время программы для расчёта расписания блоков без падения на битых данных. */
export function safeServicePlanTimelineStart(plan: { service_date: string; start_time: string }): Date {
  const dateIso =
    typeof plan.service_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(plan.service_date.trim())
      ? plan.service_date.trim()
      : '1970-01-01';
  const rawTime = typeof plan.start_time === 'string' ? plan.start_time.trim() : '';
  const time = rawTime.length > 0 ? rawTime.slice(0, 5) : '10:00';
  try {
    const cursor = parse(`${dateIso} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
    return Number.isNaN(cursor.getTime()) ? new Date() : cursor;
  } catch {
    return new Date();
  }
}
