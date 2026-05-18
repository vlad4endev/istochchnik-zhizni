import { describe, expect, it } from 'vitest';

import {
  userCanTelegramPrayerDispatch,
  userCanViewNextWeekPrayerPlan,
} from '../src/features/calendar/prayerAccess';
import type { MeResponse } from '../src/features/profile/api';
import type { RolePermissionsSettingsPublic } from '../src/features/settings/rolePermissionsApi';

function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 1,
    user_id: 'u-1',
    first_name: 'Test',
    last_name: 'User',
    name: 'Test User',
    phone_number: null,
    ministry_role: null,
    ministry_direction: null,
    birth_date: null,
    email: null,
    prayer_request: null,
    app_role: 'member',
    is_collection_coordinator: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePermsMemberCollectionEnabled(): RolePermissionsSettingsPublic {
  const roles = {} as RolePermissionsSettingsPublic['roles'];
  for (const role of [
    'parishioner',
    'member',
    'minister',
    'pastor',
    'musician',
    'editor',
    'admin',
  ] as const) {
    roles[role] = { 'calendar.collection_coordinator': role === 'member' };
  }
  return { roles };
}

describe('userCanViewNextWeekPrayerPlan', () => {
  it('returns false when user is missing', () => {
    expect(userCanViewNextWeekPrayerPlan(undefined)).toBe(false);
  });

  it('allows administrator role', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: ' admin ' }))).toBe(true);
  });

  it('allows admin in app_roles array when primary role is member', () => {
    expect(
      userCanViewNextWeekPrayerPlan(
        makeMe({ app_role: 'member', app_roles: ['member', 'admin'] }),
      ),
    ).toBe(true);
  });

  it('allows collection coordinator even without admin role', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'member', is_collection_coordinator: true }))).toBe(
      true,
    );
  });

  it('allows pastor role (как на API)', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'pastor', is_collection_coordinator: false }))).toBe(
      true,
    );
  });

  it('denies regular member without coordinator flag', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'member', is_collection_coordinator: false }))).toBe(
      false,
    );
  });

  it('denies member even when role matrix grants collection_coordinator', () => {
    expect(
      userCanViewNextWeekPrayerPlan(
        makeMe({ app_role: 'member', is_collection_coordinator: false }),
        makePermsMemberCollectionEnabled(),
      ),
    ).toBe(false);
  });
});

describe('userCanTelegramPrayerDispatch', () => {
  it('allows only admin', () => {
    expect(userCanTelegramPrayerDispatch(makeMe({ app_role: 'admin' }))).toBe(true);
    expect(userCanTelegramPrayerDispatch(makeMe({ app_role: 'member', app_roles: ['admin', 'member'] }))).toBe(
      true,
    );
    expect(userCanTelegramPrayerDispatch(makeMe({ app_role: 'member' }))).toBe(false);
    expect(
      userCanTelegramPrayerDispatch(makeMe({ app_role: 'member', is_collection_coordinator: true })),
    ).toBe(false);
  });
});
