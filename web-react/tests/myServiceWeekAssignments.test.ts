import { describe, expect, it } from 'vitest';

import {
  collectMediaRows,
  dedupeServiceWeekAssignments,
} from '../src/features/dashboard/hooks/useMyServiceWeekAssignments';
import type { MediaEvent } from '../src/features/mediaSchedule/types';

function mediaEvent(overrides: Partial<MediaEvent> = {}): MediaEvent {
  return {
    id: 10,
    event_ref_id: 10,
    title: 'Собрание',
    event_date: '2026-09-13',
    start_time: '11:00:00',
    event_type: 'service',
    template_name: 'Собрание',
    assignments: [
      {
        id: 101,
        event_ref_id: 10,
        member_id: 1,
        role_id: 1,
        status: 'confirmed',
        member: { id: 1, name: 'Тест' },
        role: {
          id: 1,
          name: 'Режиссёр',
          color: '#0369A1',
          sort_order: 1,
          is_active: true,
        },
      },
      {
        id: 102,
        event_ref_id: 10,
        member_id: 1,
        role_id: 2,
        status: 'confirmed',
        member: { id: 1, name: 'Тест' },
        role: {
          id: 2,
          name: 'Звук',
          color: '#0369A1',
          sort_order: 2,
          is_active: true,
        },
      },
    ],
    ...overrides,
  };
}

describe('my service week assignments', () => {
  it('keeps one card per role when a member has two roles on one service', () => {
    const rows = collectMediaRows([mediaEvent()], '2026-09-13');
    expect(rows.map((r) => r.roleName)).toEqual(['Режиссёр', 'Звук']);
  });

  it('dedupes when the API returns the same multi-role event twice', () => {
    // Historical bug: JOIN on assignments duplicated the event row once per role.
    const duplicatedPayload = [mediaEvent(), mediaEvent()];
    const rows = dedupeServiceWeekAssignments(collectMediaRows(duplicatedPayload, '2026-09-13'));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.roleName)).toEqual(['Режиссёр', 'Звук']);
    expect(rows.map((r) => r.key)).toEqual(['media-101', 'media-102']);
  });
});
