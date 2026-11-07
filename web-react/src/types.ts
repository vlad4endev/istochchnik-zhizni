export interface Member {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  /** Участвует в общем молитвенном цикле (приходит из API плана недели и др.). */
  in_prayer_cycle?: boolean;
  prayer_request: string | null;
  /** Когда сохраняли нужду для текущего цикла (member_prayer_by_cycle.updated_at). */
  prayer_need_updated_at?: string | null;
  previous_manual_prayer_needs?: Array<{
    id: number;
    note: string;
    created_at: string;
    /** Запись из журнала («История молитвенных записок»), не редактируется как ручная заметка. */
    source?: 'manual' | 'journal';
  }>;
}

export interface GlobalTheme {
  id: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
}

export interface Ministry {
  id: number;
  title: string;
  prayer_points: string | null;
}

export interface Backslider {
  id: number;
  name: string;
}

/** Молитвенный цикл для выбранной даты (один полный круг по участникам). */
export interface PrayerCycleInfo {
  index: number;
  number: number;
  member_count: number;
  start_date: string;
  end_date: string;
  day_index: number;
}

/** Тема молитвенной стражи на день (цикл тем страж). */
export interface PrayerWatchTopic {
  id: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PrayerWatchTopicCycleInfo {
  index: number;
  number: number;
  topic_count: number;
  start_date: string;
  end_date: string;
  day_index: number;
}

export interface PrayerWatchTopicDayAssignment {
  date: string;
  topic: PrayerWatchTopic | null;
  cycle: PrayerWatchTopicCycleInfo | null;
  is_override: boolean;
}

export interface DayPrayerData {
  date: string;
  diffDays: number;
  members: Member[];
  global_themes: GlobalTheme[];
  ministries: Ministry[];
  backsliders: Backslider[];
  prayer_cycle: PrayerCycleInfo | null;
  /** Тема для утренней/вечерней молитвенной стражи на эту дату. */
  watch_topic?: PrayerWatchTopicDayAssignment | null;
}

/** Один день из `/api/calendar/next-week/members` — молитва за члена на дату. */
export interface NextWeekMemberDay {
  date: string;
  member: Member | null;
}
