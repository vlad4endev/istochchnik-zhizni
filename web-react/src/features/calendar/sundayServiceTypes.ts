export type CalendarSundayServicePerson = {
  id: number;
  name: string;
  avatar_url: string | null;
};

export type CalendarSundayServiceSong = {
  title: string;
  key: string | null;
};

export type CalendarSundayService = {
  id: number;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published' | null;
  template_name: string | null;
  title: string;
  has_program: boolean;
  share_token: string | null;
  leader: CalendarSundayServicePerson | null;
  preacher: CalendarSundayServicePerson | null;
  sermon_topic: string | null;
  sermon_scripture: string | null;
  songs: CalendarSundayServiceSong[];
};
