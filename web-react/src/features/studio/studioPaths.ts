import { useLocation } from 'react-router-dom';

export type StudioModuleSurface = 'songbook' | 'legacy';

export function getStudioModuleSurface(pathname: string): StudioModuleSurface {
  return pathname.startsWith('/songbook') ? 'songbook' : 'legacy';
}

export function studioMySongsPath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook/studio' : '/studio/my-songs';
}

/** Единый URL редактора студии (внутри раздела песенника). */
export function studioEditSongPath(songId: number): string {
  return `/songbook/studio/edit/${songId}`;
}

export function studioSetlistsIndexPath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook/setlists' : '/studio/setlists';
}

export function studioSetlistDetailPath(surface: StudioModuleSurface, id: number): string {
  return surface === 'songbook' ? `/songbook/setlists/${id}` : `/studio/setlists/${id}`;
}

export function studioSetlistPerformPath(surface: StudioModuleSurface, id: number): string {
  return surface === 'songbook' ? `/songbook/setlists/${id}/perform` : `/studio/setlists/${id}/perform`;
}

/** База путей для страниц, общих для `/songbook/...` и `/studio/...`. */
export function useStudioModuleSurface(): StudioModuleSurface {
  const { pathname } = useLocation();
  return getStudioModuleSurface(pathname);
}
