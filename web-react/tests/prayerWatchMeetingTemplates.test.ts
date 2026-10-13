import { describe, expect, it } from 'vitest';

import {
  userCanUsePrayerWatchMeetingTemplates,
} from '../src/features/calendar/prayerAccess';
import type { MeResponse } from '../src/features/profile/api';

function me(partial: Partial<MeResponse> & Pick<MeResponse, 'app_role'>): MeResponse {
  return {
    id: 1,
    full_name: 'Test',
    ...partial,
  } as MeResponse;
}

describe('userCanUsePrayerWatchMeetingTemplates', () => {
  it('админ видит шаблоны', () => {
    expect(userCanUsePrayerWatchMeetingTemplates(me({ app_role: 'admin' }))).toBe(true);
  });

  it('координатор сбора (флаг) видит шаблоны', () => {
    expect(
      userCanUsePrayerWatchMeetingTemplates(
        me({ app_role: 'member', is_collection_coordinator: true }),
      ),
    ).toBe(true);
  });

  it('прихожанин / член церкви без флага — без шаблонов', () => {
    expect(userCanUsePrayerWatchMeetingTemplates(me({ app_role: 'parishioner' }))).toBe(false);
    expect(userCanUsePrayerWatchMeetingTemplates(me({ app_role: 'member' }))).toBe(false);
  });

  it('пастор видит шаблоны без флага координатора', () => {
    expect(userCanUsePrayerWatchMeetingTemplates(me({ app_role: 'pastor' }))).toBe(true);
  });
});
