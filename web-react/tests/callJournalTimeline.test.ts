import { describe, expect, it } from 'vitest';

import {
  countTimelineMode,
  isTimelineEventVisible,
  participantStatusLabel,
  QUIET_TIMELINE_KINDS,
} from '../src/features/admin/callJournalTimeline';

const ev = (kind: string, severity = 'info') => ({ kind, severity });

const SAMPLE = [
  ev('call_created'),
  ev('connecting'),
  ev('connected'),
  ev('stats_sample'),
  ev('network_changed'),
  ev('quality_changed'),
  ev('reconnecting', 'warn'),
  ev('room_error', 'error'),
  ev('stats_sample'),
  ev('media_toggle'),
];

describe('isTimelineEventVisible', () => {
  it('режим «важные» скрывает только технические замеры', () => {
    const visible = SAMPLE.filter((e) => isTimelineEventVisible(e, 'important'));
    expect(visible.map((e) => e.kind)).toEqual([
      'call_created',
      'connecting',
      'connected',
      'reconnecting',
      'room_error',
      'media_toggle',
    ]);
  });

  it('режим «проблемы» оставляет warn и error', () => {
    const visible = SAMPLE.filter((e) => isTimelineEventVisible(e, 'issues'));
    expect(visible.map((e) => e.kind)).toEqual(['reconnecting', 'room_error']);
  });

  it('режим «все» ничего не скрывает', () => {
    expect(SAMPLE.filter((e) => isTimelineEventVisible(e, 'all'))).toHaveLength(SAMPLE.length);
  });

  it('countTimelineMode согласован с фильтром', () => {
    expect(countTimelineMode(SAMPLE, 'important')).toBe(6);
    expect(countTimelineMode(SAMPLE, 'issues')).toBe(2);
    expect(countTimelineMode(SAMPLE, 'all')).toBe(SAMPLE.length);
  });

  it('тихие типы — это stats/network/quality', () => {
    expect([...QUIET_TIMELINE_KINDS].sort()).toEqual([
      'network_changed',
      'quality_changed',
      'stats_sample',
    ]);
  });
});

describe('participantStatusLabel', () => {
  it('переводит известные статусы участника', () => {
    expect(participantStatusLabel('joined')).toBe('В звонке');
    expect(participantStatusLabel('left')).toBe('Вышел');
    expect(participantStatusLabel('missed')).toBe('Не ответил');
  });

  it('неизвестный статус возвращает как есть', () => {
    expect(participantStatusLabel('mysterious')).toBe('mysterious');
  });
});
