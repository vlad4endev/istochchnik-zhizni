export interface Member {
  id: number;
  name: string;
  prayer_request: string | null;
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

export interface DayPrayerData {
  date: string;
  diffDays: number;
  members: Member[];
  global_themes: GlobalTheme[];
  ministries: Ministry[];
  backsliders: Backslider[];
}
