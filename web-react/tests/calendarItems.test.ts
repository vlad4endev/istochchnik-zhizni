import { describe, expect, it } from 'vitest';

import type { ChurchEventItem } from '../src/features/calendar/api';
import {
  isGenericSundayWorshipEvent,
  listCalendarItemsOnLocalDay,
  sundayServiceSubtitle,
  upcomingSundayServices,
} from '../src/features/calendar/calendarItems';
import type { CalendarSundayService } from '../src/features/calendar/sundayServiceTypes';

function event(partial: Partial<ChurchEventItem> & Pick<ChurchEventItem, 'id' | 'title'>): ChurchEventItem {
  return {
    description: null,
    event_date: '2026-08-16',
    event_time: '10:00',
    recurrence_type: 'weekly',
    weekly_day: 0,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function service(partial: Partial<CalendarSundayService> = {}): CalendarSundayService {
  return {
    id: 7,
    service_date: '2026-08-16',
    start_time: '10:00',
    status: 'published',
    template_name: 'Воскресное',
    title: 'Воскресное служение',
    has_program: true,
    share_token: 'abc',
    leader: { id: 1, name: 'Анна Ведущая', avatar_url: null },
    preacher: { id: 2, name: 'Пётр', avatar_url: null },
    sermon_topic: 'Живая надежда',
    sermon_scripture: '1 Пет. 1:3',
    songs: [{ title: 'Свят', key: 'G' }],
    ...partial,
  };
}

describe('calendarItems', () => {
  it('recognizes generic Sunday worship events for dedupe', () => {
    expect(isGenericSundayWorshipEvent(event({ id: 1, title: 'Воскресное богослужение' }))).toBe(true);
    expect(isGenericSundayWorshipEvent(event({ id: 2, title: 'Молодёжка' }))).toBe(false);
  });

  it('merges Sunday service ahead of other events and hides duplicate worship event', () => {
    const sunday = new Date(2026, 7, 16);
    const items = listCalendarItemsOnLocalDay(
      sunday,
      [
        event({ id: 1, title: 'Воскресное богослужение' }),
        event({ id: 2, title: 'Обед', event_time: '13:00', recurrence_type: 'once', weekly_day: null }),
      ],
      [],
      [service()],
      '2026-08-16',
    );
    expect(items.map((row) => row.kind)).toEqual(['sunday', 'event']);
    expect(items[0]?.kind === 'sunday' && items[0].service.sermon_topic).toBe('Живая надежда');
    expect(items[1]?.kind === 'event' && items[1].occurrence.item.title).toBe('Обед');
  });

  it('picks upcoming Sundays from today and builds a subtitle from the sermon topic', () => {
    const upcoming = upcomingSundayServices(
      [
        service({ service_date: '2026-08-09' }),
        service({ id: 8, service_date: '2026-08-16' }),
        service({ id: 9, service_date: '2026-08-23' }),
      ],
      '2026-08-16',
      3,
    );
    expect(upcoming.map((s) => s.service_date)).toEqual(['2026-08-16', '2026-08-23']);
    expect(sundayServiceSubtitle(service())).toBe('Живая надежда');
  });
});
