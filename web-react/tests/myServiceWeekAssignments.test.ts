import { describe, expect, it } from 'vitest';

import {
  aggregateServiceWeekStatus,
  collectMediaRows,
  dedupeServiceWeekRoleRows,
  mergeServiceWeekRoleRows,
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
  it('merges two roles on one service into a single card', () => {
    const cards = mergeServiceWeekRoleRows(collectMediaRows([mediaEvent()], '2026-09-13'));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.key).toBe('media:10');
    expect(cards[0]!.roles.map((r) => r.roleName)).toEqual(['Режиссёр', 'Звук']);
    expect(aggregateServiceWeekStatus(cards[0]!.roles)).toBe('confirmed');
  });

  it('dedupes when the API returns the same multi-role event twice', () => {
    // Historical bug: JOIN on assignments duplicated the event row once per role.
    const duplicatedPayload = [mediaEvent(), mediaEvent()];
    const rows = dedupeServiceWeekRoleRows(collectMediaRows(duplicatedPayload, '2026-09-13'));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.role.roleName)).toEqual(['Режиссёр', 'Звук']);

    const cards = mergeServiceWeekRoleRows(rows);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.roles.map((r) => r.roleName)).toEqual(['Режиссёр', 'Звук']);
  });

  it('keeps separate cards for different events on the same day', () => {
    const second = mediaEvent({
      id: 11,
      event_ref_id: 11,
      title: 'Вечер',
      template_name: 'Вечер',
      start_time: '18:00:00',
      assignments: [
        {
          id: 201,
          event_ref_id: 11,
          member_id: 1,
          role_id: 2,
          status: 'assigned',
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
    });
    const cards = mergeServiceWeekRoleRows(collectMediaRows([mediaEvent(), second], '2026-09-13'));
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.key)).toEqual(['media:10', 'media:11']);
  });

  it('merges roles when the API splits one service into one-assignment events', () => {
    const directorOnly = mediaEvent({
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
      ],
    });
    const soundOnly = mediaEvent({
      assignments: [
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
    });
    const cards = mergeServiceWeekRoleRows(
      collectMediaRows([directorOnly, soundOnly], '2026-09-13'),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.roles.map((r) => r.roleName)).toEqual(['Режиссёр', 'Звук']);
  });

  it('marks the card pending if any role still needs a response', () => {
    const mixed = mediaEvent({
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
          status: 'assigned',
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
    });
    const cards = mergeServiceWeekRoleRows(collectMediaRows([mixed], '2026-09-13'));
    expect(aggregateServiceWeekStatus(cards[0]!.roles)).toBe('pending');
  });
});
