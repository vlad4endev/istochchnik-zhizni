import { memberRosterName, splitMemberNameParts } from '../../lib/memberRosterName';
import {
  APP_ROLE_IDS,
  appRoleLabel,
  type AppRole,
} from '../settings/sectionVisibilityApi';
import type { AppUser } from './types';

export type MemberAccountFilter = 'all' | 'in_app' | 'no_login' | 'inactive';

export type MemberListQuery = {
  search: string;
  role: string;
  account: MemberAccountFilter;
  ministry: string;
};

const ROLE_RANK: Record<AppRole, number> = {
  parishioner: 0,
  member: 1,
  minister: 2,
  pastor: 3,
  musician: 4,
  editor: 5,
  admin: 6,
};

const ROLE_SEARCH_ALIASES: Record<AppRole, readonly string[]> = {
  parishioner: ['прихожанин', 'гость', 'parishioner'],
  member: ['член церкви', 'член', 'участник', 'member'],
  minister: ['служитель', 'minister'],
  pastor: ['пастор', 'pastor'],
  musician: ['музыкант', 'musician'],
  editor: ['редактор', 'редактор каталога', 'editor'],
  admin: ['администратор', 'админ', 'admin'],
};

export const MEMBER_ACCOUNT_FILTER_OPTIONS: ReadonlyArray<{
  value: MemberAccountFilter;
  label: string;
}> = [
  { value: 'all', label: 'Все статусы' },
  { value: 'in_app', label: 'В приложении' },
  { value: 'no_login', label: 'Нет входа' },
  { value: 'inactive', label: 'Неактивные' },
];

export function isAppRoleId(value: string): value is AppRole {
  return (APP_ROLE_IDS as readonly string[]).includes(value);
}

/** Все роли карточки: массив `app_roles`, иначе основная `app_role`. */
export function memberAppRoles(u: Pick<AppUser, 'app_role' | 'app_roles'>): AppRole[] {
  if (Array.isArray(u.app_roles) && u.app_roles.length > 0) {
    const seen = new Set<AppRole>();
    const out: AppRole[] = [];
    for (const role of u.app_roles) {
      if (!seen.has(role)) {
        seen.add(role);
        out.push(role);
      }
    }
    if (out.length > 0) return out;
  }
  return [u.app_role];
}

/**
 * Роли для бейджей в списке: без «Член церкви», если есть более конкретная роль.
 * Порядок — от более высокой роли к низкой.
 */
export function displayMemberAppRoles(u: Pick<AppUser, 'app_role' | 'app_roles'>): AppRole[] {
  const roles = memberAppRoles(u);
  const specific = roles.filter((role) => role !== 'member');
  const shown = specific.length > 0 ? specific : roles;
  return [...shown].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
}

export function memberHasAppRole(u: Pick<AppUser, 'app_role' | 'app_roles'>, role: AppRole): boolean {
  return memberAppRoles(u).includes(role);
}

/**
 * Фильтр «Член церкви» — только те, у кого нет другой роли приложения.
 * Остальные фильтры — «есть эта роль» (музыкант+редактор попадает в оба).
 */
export function memberMatchesRoleFilter(
  u: Pick<AppUser, 'app_role' | 'app_roles'>,
  roleFilter: string,
): boolean {
  if (!roleFilter) return true;
  if (!isAppRoleId(roleFilter)) return true;
  const roles = memberAppRoles(u);
  if (roleFilter === 'member') {
    return roles.includes('member') && roles.every((role) => role === 'member');
  }
  return roles.includes(roleFilter);
}

export function parseMemberAccountFilter(value: string | null | undefined): MemberAccountFilter {
  if (value === 'in_app' || value === 'no_login' || value === 'inactive') return value;
  return 'all';
}

export function memberMatchesAccountFilter(
  u: Pick<AppUser, 'is_active' | 'has_registered'>,
  account: MemberAccountFilter,
): boolean {
  if (account === 'all') return true;
  if (account === 'in_app') return u.has_registered && u.is_active;
  if (account === 'no_login') return !u.has_registered;
  return !u.is_active;
}

export function memberMinistryDirections(u: Pick<AppUser, 'ministry_direction'>): string[] {
  return (u.ministry_direction ?? '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function memberMatchesMinistryFilter(
  u: Pick<AppUser, 'ministry_direction'>,
  ministry: string,
): boolean {
  if (!ministry.trim()) return true;
  return memberMinistryDirections(u).includes(ministry.trim());
}

export function uniqueMinistryDirections(list: readonly Pick<AppUser, 'ministry_direction'>[]): string[] {
  const set = new Set<string>();
  for (const u of list) {
    for (const direction of memberMinistryDirections(u)) {
      set.add(direction);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Цифры телефона; российская 8XXXXXXXXXX приводится к 7XXXXXXXXXX. */
export function phoneDigitsForSearch(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  return digits;
}

function foldSearchText(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

function memberSearchHaystack(u: AppUser): { text: string; phone: string } {
  const roles = memberAppRoles(u);
  const roleWords = roles.flatMap((role) => [appRoleLabel(role), ...(ROLE_SEARCH_ALIASES[role] ?? [])]);
  const parts = [
    memberRosterName(u),
    `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
    `${u.last_name ?? ''} ${u.first_name ?? ''}`.trim(),
    u.name,
    u.phone_number ?? '',
    u.email ?? '',
    u.telegram_chat_id ?? '',
    u.ministry_role ?? '',
    u.ministry_direction ?? '',
    ...roleWords,
    u.has_registered ? 'в приложении' : 'нет входа не зарегистрирован',
    u.is_active ? 'активен' : 'неактивен отключён',
    u.in_prayer_cycle ? 'в цикле молитв' : '',
  ];
  return {
    text: foldSearchText(parts.filter((part) => part.length > 0).join(' ')),
    phone: phoneDigitsForSearch(u.phone_number ?? ''),
  };
}

export function memberMatchesSearch(u: AppUser, rawQuery: string): boolean {
  const query = foldSearchText(rawQuery);
  if (!query) return true;
  const { text, phone } = memberSearchHaystack(u);
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    const tokenDigits = phoneDigitsForSearch(token);
    if (tokenDigits.length >= 3 && phone.includes(tokenDigits)) {
      return true;
    }
    return text.includes(token);
  });
}

export function formatMemberPhone(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '—';
  const digits = phoneDigitsForSearch(trimmed);
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 10) {
    return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  }
  return trimmed;
}

export function ruPeopleCount(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} пользователь`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} пользователя`;
  return `${n} пользователей`;
}

export function memberSortLetter(u: {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const parts = splitMemberNameParts(u);
  const source = parts.last.trim() || parts.first.trim() || memberRosterName(u);
  const ch = source.charAt(0).toLocaleUpperCase('ru-RU');
  if (ch === 'Ё') return 'Е';
  if (/[А-ЯA-Z]/.test(ch)) return ch;
  return '#';
}

export function groupMembersByLetter(list: readonly AppUser[]): Array<{ letter: string; members: AppUser[] }> {
  const groups: Array<{ letter: string; members: AppUser[] }> = [];
  for (const u of list) {
    const letter = memberSortLetter(u);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) {
      last.members.push(u);
    } else {
      groups.push({ letter, members: [u] });
    }
  }
  return groups;
}

export function filterAdminMembers(list: readonly AppUser[], query: MemberListQuery): AppUser[] {
  return list.filter(
    (u) =>
      memberMatchesSearch(u, query.search) &&
      memberMatchesRoleFilter(u, query.role) &&
      memberMatchesAccountFilter(u, query.account) &&
      memberMatchesMinistryFilter(u, query.ministry),
  );
}

export function countMembersMatchingRole(list: readonly AppUser[], role: AppRole): number {
  return list.filter((u) => memberMatchesRoleFilter(u, role)).length;
}

export function countMembersMatchingAccount(
  list: readonly AppUser[],
  account: MemberAccountFilter,
): number {
  return list.filter((u) => memberMatchesAccountFilter(u, account)).length;
}

export function memberListQueryIsActive(query: MemberListQuery): boolean {
  return (
    Boolean(query.search.trim()) ||
    Boolean(query.role) ||
    query.account !== 'all' ||
    Boolean(query.ministry.trim())
  );
}

export function emptyMemberListQuery(): MemberListQuery {
  return { search: '', role: '', account: 'all', ministry: '' };
}
