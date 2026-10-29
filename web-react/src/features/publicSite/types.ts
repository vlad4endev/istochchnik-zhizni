export type SiteSettings = {
  church_name: string;
  tagline: string;
  about_text: string;
  contact_text: string;
  show_events: boolean;
  show_live: boolean;
  show_gallery: boolean;
  updated_at: string | null;
};

export type SiteEvent = {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  category?: string | null;
  poster_url?: string | null;
};

export type SiteBroadcast = {
  id: number;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  platform: string;
  stream_url: string | null;
  status: string;
};

export type SiteGalleryAlbum = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  sort_order: number;
  is_published: boolean;
  photo_count: number;
  created_at: string;
  updated_at: string;
};

export type SiteGalleryPhoto = {
  id: number;
  album_id: number;
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type SiteOverview = {
  settings: SiteSettings;
  events: SiteEvent[];
  broadcast: SiteBroadcast | null;
  albums: SiteGalleryAlbum[];
};
