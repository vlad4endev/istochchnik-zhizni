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
