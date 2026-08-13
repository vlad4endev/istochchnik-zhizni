import { describe, expect, it } from 'vitest';

import {
  countMembersMatchingRole,
  displayMemberAppRoles,
  filterAdminMembers,
  formatMemberPhone,
  groupMembersByLetter,
  memberAppRoles,
  memberHasAppRole,
  memberMatchesRoleFilter,
  memberMatchesSearch,
  phoneDigitsForSearch,
  ruPeopleCount,
} from '../src/features/admin/memberListQuery';
import type { AppUser } from '../src/features/admin/types';

function user(partial: Partial<AppUser> & Pick<AppUser, 'id'>): AppUser {
  return {
    user_id: `uuid-${partial.id}`,
    first_name: 'Иван',
    last_name: 'Петров',
    name: 'Иван Петров',
    phone_number: '+7 (900) 123-45-67',
    telegram_chat_id: '123456789',
    telegram_delivery_blocked: false,
    telegram_delivery_block_reason: null,
    telegram_delivery_blocked_at: null,
    ministry_role: null,
    ministry_direction: null,
    prayer_request: null,
    birth_date: '1990-05-12',
    email: 'ivan@example.com',
    account_provider: null,
    account_id: null,
    is_active: true,
    app_role: 'member',
    app_roles: ['member'],
    is_collection_coordinator: false,
    in_prayer_cycle: false,
    has_registered: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('memberAppRoles', () => {
  it('uses app_roles when present', () => {
    expect(
      memberAppRoles(user({ id: 1, app_role: 'member', app_roles: ['member', 'admin'] })),
    ).toEqual(['member', 'admin']);
  });

  it('falls back to primary app_role', () => {
    expect(memberAppRoles(user({ id: 1, app_role: 'pastor', app_roles: [] }))).toEqual(['pastor']);
  });
});

describe('displayMemberAppRoles', () => {
  it('hides member when a more specific role exists', () => {
    expect(
      displayMemberAppRoles(user({ id: 1, app_role: 'admin', app_roles: ['member', 'admin'] })),
    ).toEqual(['admin']);
  });

  it('shows member when that is the only role', () => {
    expect(displayMemberAppRoles(user({ id: 1 }))).toEqual(['member']);
  });

  it('sorts stacked roles with higher first', () => {
    expect(
      displayMemberAppRoles(
        user({ id: 1, app_role: 'editor', app_roles: ['musician', 'editor', 'member'] }),
      ),
    ).toEqual(['editor', 'musician']);
  });
});

describe('memberMatchesRoleFilter', () => {
  it('matches admin by app_roles even if primary is not admin', () => {
    const u = user({ id: 1, app_role: 'member', app_roles: ['member', 'admin'] });
    expect(memberHasAppRole(u, 'admin')).toBe(true);
    expect(memberMatchesRoleFilter(u, 'admin')).toBe(true);
  });

  it('does not treat stacked roles as «только член церкви»', () => {
    const u = user({ id: 1, app_role: 'admin', app_roles: ['member', 'admin'] });
    expect(memberMatchesRoleFilter(u, 'member')).toBe(false);
    expect(memberMatchesRoleFilter(user({ id: 2 }), 'member')).toBe(true);
  });

  it('finds musician among editor+musician', () => {
    const u = user({ id: 1, app_role: 'editor', app_roles: ['musician', 'editor'] });
    expect(memberMatchesRoleFilter(u, 'musician')).toBe(true);
    expect(memberMatchesRoleFilter(u, 'editor')).toBe(true);
    expect(memberMatchesRoleFilter(u, 'pastor')).toBe(false);
  });
});

describe('memberMatchesSearch', () => {
  it('matches last and first name in either order', () => {
    const u = user({ id: 1 });
    expect(memberMatchesSearch(u, 'петров')).toBe(true);
    expect(memberMatchesSearch(u, 'иван петров')).toBe(true);
    expect(memberMatchesSearch(u, 'петров иван')).toBe(true);
  });

  it('matches russian phone typed as 8XXXXXXXXXX or with spaces', () => {
    const u = user({ id: 1, phone_number: '+7 (900) 123-45-67' });
    expect(memberMatchesSearch(u, '89001234567')).toBe(true);
    expect(memberMatchesSearch(u, '900 123')).toBe(true);
    expect(phoneDigitsForSearch('8 (900) 123-45-67')).toBe('79001234567');
  });

  it('matches role labels and aliases', () => {
    const u = user({ id: 1, app_role: 'admin', app_roles: ['admin'] });
    expect(memberMatchesSearch(u, 'админ')).toBe(true);
    expect(memberMatchesSearch(u, 'администратор')).toBe(true);
  });

  it('requires every token (AND)', () => {
    const u = user({ id: 1, last_name: 'Сидоров', first_name: 'Пётр', name: 'Пётр Сидоров' });
    expect(memberMatchesSearch(u, 'сидоров пастор')).toBe(false);
    expect(memberMatchesSearch(u, 'пётр сидоров')).toBe(true);
  });

  it('matches ministry role', () => {
    const u = user({ id: 1, ministry_role: 'Вокал', ministry_direction: 'Прославление' });
    expect(memberMatchesSearch(u, 'вокал')).toBe(true);
    expect(memberMatchesSearch(u, 'прославление')).toBe(true);
  });
});

describe('filterAdminMembers', () => {
  const list = [
    user({ id: 1, last_name: 'Андреев', first_name: 'Олег', name: 'Олег Андреев', has_registered: true }),
    user({
      id: 2,
      last_name: 'Борисова',
      first_name: 'Анна',
      name: 'Анна Борисова',
      app_role: 'admin',
      app_roles: ['member', 'admin'],
      has_registered: true,
    }),
    user({
      id: 3,
      last_name: 'Волков',
      first_name: 'Илья',
      name: 'Илья Волков',
      has_registered: false,
      phone_number: '89161112233',
    }),
    user({
      id: 4,
      last_name: 'Громов',
      first_name: 'Павел',
      name: 'Павел Громов',
      is_active: false,
      has_registered: true,
    }),
  ];

  it('combines search, role and account filters', () => {
    expect(filterAdminMembers(list, { search: 'анна', role: 'admin', account: 'all', ministry: '' }).map((u) => u.id)).toEqual([
      2,
    ]);
    expect(filterAdminMembers(list, { search: '', role: '', account: 'no_login', ministry: '' }).map((u) => u.id)).toEqual([
      3,
    ]);
    expect(filterAdminMembers(list, { search: '8916', role: '', account: 'all', ministry: '' }).map((u) => u.id)).toEqual([
      3,
    ]);
  });

  it('counts admins by app_roles, not only primary field', () => {
    expect(countMembersMatchingRole(list, 'admin')).toBe(1);
  });

  it('filters by ministry direction', () => {
    const withDir = [
      user({ id: 1, ministry_direction: 'Прославление' }),
      user({ id: 2, last_name: 'Борисова', first_name: 'Анна', name: 'Анна Борисова', ministry_direction: 'Медиа, Прославление' }),
      user({ id: 3, last_name: 'Волков', first_name: 'Илья', name: 'Илья Волков', ministry_direction: 'Медиа' }),
    ];
    expect(
      filterAdminMembers(withDir, { search: '', role: '', account: 'all', ministry: 'Прославление' }).map((u) => u.id),
    ).toEqual([1, 2]);
  });
});

describe('formatMemberPhone and grouping', () => {
  it('formats russian numbers', () => {
    expect(formatMemberPhone('+7 (900) 123-45-67')).toBe('+7 900 123-45-67');
    expect(formatMemberPhone('89001234567')).toBe('+7 900 123-45-67');
    expect(formatMemberPhone('')).toBe('—');
  });

  it('groups a sorted list by last-name letter', () => {
    const list = [
      user({ id: 1, last_name: 'Андреев', first_name: 'Олег', name: 'Олег Андреев' }),
      user({ id: 2, last_name: 'Борисова', first_name: 'Анна', name: 'Анна Борисова' }),
      user({ id: 3, last_name: 'Волков', first_name: 'Илья', name: 'Илья Волков' }),
    ];
    expect(groupMembersByLetter(list).map((g) => [g.letter, g.members.length])).toEqual([
      ['А', 1],
      ['Б', 1],
      ['В', 1],
    ]);
  });

  it('pluralizes пользователь', () => {
    expect(ruPeopleCount(1)).toBe('1 пользователь');
    expect(ruPeopleCount(2)).toBe('2 пользователя');
    expect(ruPeopleCount(5)).toBe('5 пользователей');
    expect(ruPeopleCount(21)).toBe('21 пользователь');
  });
});
