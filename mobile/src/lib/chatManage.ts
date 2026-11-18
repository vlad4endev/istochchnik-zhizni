import type {
  ChatMember,
  ParticipantRole,
  PermissionKey,
  PermissionMap,
} from '../api/chatManage';
import type { MessageWithSender } from '../api/messenger';

export const PERMISSION_DEFAULTS: Record<PermissionKey, boolean> = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: false,
  can_pin_messages: false,
  can_manage_chat: false,
};

export const PERMISSION_ROWS: Array<{
  key: PermissionKey;
  title: string;
  description: string;
}> = [
  { key: 'can_send_messages', title: 'Отправка сообщений', description: 'Обычные участники смогут писать' },
  { key: 'can_send_media', title: 'Медиа', description: 'Фото, файлы, голосовые и аудио' },
  { key: 'can_add_users', title: 'Добавление участников', description: 'Кто может приглашать людей' },
  { key: 'can_pin_messages', title: 'Закрепление сообщений', description: 'В шапке чата' },
  {
    key: 'can_manage_chat',
    title: 'Управление чатом',
    description: 'Название, фото, разрешения (у новых участников по умолчанию выкл.)',
  },
];

/** Права группы по умолчанию с подстановкой значений по умолчанию. */
export function withPermissionDefaults(p: PermissionMap | undefined): Record<PermissionKey, boolean> {
  return { ...PERMISSION_DEFAULTS, ...(p ?? {}) } as Record<PermissionKey, boolean>;
}

/** Права участника: личные поверх прав группы. */
export function memberPermissions(
  member: Pick<ChatMember, 'permissions'>,
  groupDefaults: PermissionMap | undefined,
): Record<PermissionKey, boolean> {
  const base = withPermissionDefaults(groupDefaults);
  const out = { ...base };
  for (const k of Object.keys(base) as PermissionKey[]) {
    const v = member.permissions[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function isAppAdmin(role: string | undefined, roles: string[] | undefined): boolean {
  return (
    String(role ?? '').toLowerCase() === 'admin' ||
    (roles ?? []).some((r) => String(r).toLowerCase() === 'admin')
  );
}

/** Редактирование группы и прав: админ приложения или право «Управление чатом». */
export function canManageGroup(eff: PermissionMap | undefined, appAdmin: boolean): boolean {
  return appAdmin || eff?.can_manage_chat === true;
}

export function canAddToGroup(eff: PermissionMap | undefined, appAdmin: boolean): boolean {
  return appAdmin || eff?.can_add_users === true;
}

export function roleBadge(role: ParticipantRole): string | null {
  return role === 'owner' ? 'владелец' : role === 'admin' ? 'админ' : null;
}

export type MemberRow = ChatMember & { online: boolean; seen: string | null; displayName: string };

/** Владелец → админы → в сети → остальные (по имени). */
export function sortMembers(
  members: ChatMember[],
  onlineIds: Set<number>,
  lastSeen: Record<number, string>,
): MemberRow[] {
  const rows = members.map((m) => ({
    ...m,
    online: onlineIds.has(m.member_id) || m.is_online,
    seen: lastSeen[m.member_id] ?? m.last_seen_at,
    displayName: [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.name,
  }));
  const rank = (m: MemberRow) => (m.role === 'owner' ? 0 : m.role === 'admin' ? 1 : m.online ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, 'ru'));
}

export function pluralMembers(n: number, channel: boolean): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const forms = channel
    ? ['подписчик', 'подписчика', 'подписчиков']
    : ['участник', 'участника', 'участников'];
  const form = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
  return `${n} ${form}`;
}

/** Через сколько дней день рождения (0 — сегодня); null — даты нет или она неверная. */
export function daysUntilBirthday(birth: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export function splitList(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ───────── Общие медиа, файлы и ссылки ───────── */

export type SharedPhoto = { messageId: string; slot: number; multi: boolean };
export type SharedFile = { messageId: string; name: string; size: number; video: boolean };
export type SharedLink = { messageId: string; url: string };

const URL_RE = /(https?:\/\/[^\s]+)/gi;

function payloadOf(m: MessageWithSender): Record<string, unknown> {
  const p = m.payload;
  return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
}

/** Из сообщений (в любом порядке) собирает фото, файлы и ссылки: свежие сверху. */
export function extractSharedMedia(messages: MessageWithSender[]): {
  photos: SharedPhoto[];
  files: SharedFile[];
  links: SharedLink[];
} {
  const ordered = [...messages].sort((a, b) => Number(b.id) - Number(a.id));
  const photos: SharedPhoto[] = [];
  const files: SharedFile[] = [];
  const links: SharedLink[] = [];
  for (const m of ordered) {
    if (m.is_deleted || !/^\d+$/.test(String(m.id))) continue;
    const p = payloadOf(m);
    const type = m.payload_type ?? 'text';
    if (type === 'image') {
      const imgs = Array.isArray(p.images) ? p.images : [];
      const n = imgs.length > 0 ? imgs.length : p.url ? 1 : 0;
      for (let i = 0; i < n; i += 1) photos.push({ messageId: m.id, slot: i, multi: imgs.length > 1 });
    } else if (type === 'file' || type === 'video_note') {
      const mime = String(p.mimeType ?? '').toLowerCase();
      files.push({
        messageId: m.id,
        name: String(p.name ?? p.filename ?? '').trim() || 'Файл',
        size: Number(p.size) || 0,
        video: type === 'video_note' || mime.startsWith('video/'),
      });
    }
    if (type === 'text' || type === 'image' || type === 'file') {
      const found = String(m.content ?? '').match(URL_RE) ?? [];
      for (const url of found) links.push({ messageId: m.id, url: url.replace(/[).,;!?]+$/, '') });
    }
  }
  return { photos, files, links };
}
