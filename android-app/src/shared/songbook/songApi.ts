import {apiClient} from '../apiClient';
import type {SongListItem} from './types';

const SONGS = '/api/songs';

export async function fetchSongsFromApi(): Promise<SongListItem[]> {
  const {data} = await apiClient.get<SongListItem[]>(SONGS);
  return data;
}

export async function fetchSongFromApi(id: number | string): Promise<SongListItem> {
  const {data} = await apiClient.get<SongListItem>(`${SONGS}/${id}`);
  return data;
}
