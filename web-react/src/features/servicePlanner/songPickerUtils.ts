export type ServicePlannerSongOption = {
  id: number | string;
  title: string;
  default_key: string | null;
  song_number?: number | null;
  tags?: string[];
};

export function servicePlannerSongId(song: Pick<ServicePlannerSongOption, 'id'>): number {
  return typeof song.id === 'number' ? song.id : Number(song.id);
}

export function normalizeSongSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

export function formatServicePlannerSongLabel(
  song: Pick<ServicePlannerSongOption, 'title' | 'default_key'>,
): string {
  const key = String(song.default_key ?? '').trim();
  return key ? `${song.title} [${key}]` : song.title;
}

export function songMatchesSearch(song: ServicePlannerSongOption, query: string): boolean {
  const q = normalizeSongSearchText(query);
  if (!q) return true;

  const title = normalizeSongSearchText(song.title);
  if (title.includes(q)) return true;

  const key = normalizeSongSearchText(String(song.default_key ?? ''));
  if (key && key.includes(q)) return true;

  if (song.song_number != null && String(song.song_number).includes(q.replace(/^#/, ''))) return true;

  const tags = (song.tags ?? []).map(normalizeSongSearchText).join(' ');
  if (tags.includes(q)) return true;

  return false;
}

export function sortServicePlannerSongs(a: ServicePlannerSongOption, b: ServicePlannerSongOption): number {
  const aNum = a.song_number;
  const bNum = b.song_number;
  if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
  if (aNum != null && bNum == null) return -1;
  if (aNum == null && bNum != null) return 1;
  return a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' });
}

export function filterServicePlannerSongs(
  songs: ServicePlannerSongOption[],
  query: string,
): ServicePlannerSongOption[] {
  return songs.filter((song) => songMatchesSearch(song, query)).sort(sortServicePlannerSongs);
}
