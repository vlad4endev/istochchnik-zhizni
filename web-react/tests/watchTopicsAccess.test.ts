import { describe, expect, it } from 'vitest';

import { userCanEditWatchTopics } from '../src/features/calendar/prayerAccess';
import type { MeResponse } from '../src/features/profile/api';
import type { RolePermissionsSettingsPublic } from '../src/features/settings/rolePermissionsApi';

function me(partial: Partial<MeResponse> & Pick<MeResponse, 'app_role'>): MeResponse {
  return {
    id: 1,
    full_name: 'Test',
    ...partial,
  } as MeResponse;
}

function permsGranting(role: string, permissionId: string): RolePermissionsSettingsPublic {
  return {
    roles: {
      admin: {},
      pastor: {},
      minister: {},
      musician: {},
      editor: {},
      member: {},
      parishioner: {},
      [role]: { [permissionId]: true },
    },
  } as RolePermissionsSettingsPublic;
}

describe('userCanEditWatchTopics', () => {
  it('админ может редактировать', () => {
    expect(userCanEditWatchTopics(me({ app_role: 'admin' }))).toBe(true);
  });

  it('пастор может редактировать без матрицы', () => {
    expect(userCanEditWatchTopics(me({ app_role: 'pastor' }))).toBe(true);
  });

  it('член церкви без права — нет', () => {
    expect(userCanEditWatchTopics(me({ app_role: 'member' }), permsGranting('minister', 'calendar.watch_topics_edit'))).toBe(
      false,
    );
  });

  it('служитель с правом calendar.watch_topics_edit — да', () => {
    expect(
      userCanEditWatchTopics(
        me({ app_role: 'minister' }),
        permsGranting('minister', 'calendar.watch_topics_edit'),
      ),
    ).toBe(true);
  });
});
