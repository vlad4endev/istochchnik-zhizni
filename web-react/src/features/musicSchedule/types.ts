export interface MusicRole {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  sort_order: number;
  is_active: boolean;
  ministry_direction_filter?: string | null;
  ministry_role_filter?: string | null;
}

export interface MusicAssignment {
  id: number;
  event_ref_id: number;
  member_id: number;
  role_id: number;
  status: 'assigned' | 'confirmed' | 'declined' | 'pending';
  notes?: string | null;
  member: { id: number; name: string; avatar_url?: string | null };
  role: MusicRole;
  /** @deprecated используйте event_ref_id */
  event_id?: number;
}

/** План служения из планировщика с медиа-назначениями. */
export interface MusicEvent {
  id: number;
  event_ref_id: number;
  title: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  event_type: string;
  notes?: string | null;
  template_name?: string | null;
  church_event_id?: number | null;
  created_at?: string;
  updated_at?: string;
  assignments: MusicAssignment[];
}

export interface MusicScheduleMember {
  id: number;
  name: string;
  avatar_url?: string | null;
  ministry_direction?: string | null;
  ministry_role?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type MusicScheduleViewMode = 'month' | 'assemblies';

export function formatPlannerEventLabel(ev: {
  title: string;
  event_date: string;
  start_time?: string | null;
  template_name?: string | null;
}): string {
  const name = (ev.template_name?.trim() || ev.title.trim() || 'Служение');
  const dateParts = ev.event_date.split('-');
  const day = dateParts[2] ?? ev.event_date;
  const monthNames = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const monthIdx = Number(dateParts[1]) - 1;
  const month = monthNames[monthIdx] ?? dateParts[1] ?? '';
  const time = ev.start_time ? ` ${ev.start_time}` : '';
  return `${name} — ${Number(day)} ${month}${time}`;
}

export function memberAvatarColor(memberId: number): string {
  const palette = ['#7d3640', '#0891b2', '#059669', '#d97706', '#6366f1', '#9333ea', '#dc2626'];
  let hash = 0;
  for (let i = 0; i < String(memberId).length; i += 1) {
    hash = (hash * 31 + String(memberId).charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length] ?? palette[0];
}
