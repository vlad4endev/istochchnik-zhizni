import { describe, expect, it } from 'vitest';

import { userCanViewNextWeekPrayerPlan } from '../src/features/calendar/components/NextWeekPrayerPlanSection';
import type { MeResponse } from '../src/features/profile/api';

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

describe('userCanViewNextWeekPrayerPlan', () => {
  it('returns false when user is missing', () => {
    expect(userCanViewNextWeekPrayerPlan(undefined)).toBe(false);
  });

  it('allows administrator role', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: ' admin ' }))).toBe(true);
  });

  it('allows collection coordinator even without admin role', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'member', is_collection_coordinator: true }))).toBe(true);
  });

  it('denies pastor without collection coordinator flag', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'pastor', is_collection_coordinator: false }))).toBe(false);
  });

  it('denies regular member without coordinator flag', () => {
    expect(userCanViewNextWeekPrayerPlan(makeMe({ app_role: 'member', is_collection_coordinator: false }))).toBe(false);
  });
});
