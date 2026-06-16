import { useLocation } from 'react-router-dom';

import { isStudioDeploy } from '../../lib/appVariant';

export type StudioModuleSurface = 'songbook' | 'legacy';

export type StudioEditorLocationState = {
  backTo?: string;
};

/** На поддомене студии редактор живёт под `/songbook/studio/edit`, но навигация — `/studio/...`. */
export function getStudioModuleSurface(pathname: string): StudioModuleSurface {
  if (isStudioDeploy()) return 'legacy';
  return pathname.startsWith('/songbook') ? 'songbook' : 'legacy';
}

export function studioMySongsPath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook/studio' : '/studio/my-songs';
}

export function studioCatalogPath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook' : '/studio/catalog';
}

export function studioMySongsDraftsPath(surface: StudioModuleSurface): string {
  return `${studioMySongsPath(surface)}?tab=drafts`;
}

/** Единый экран создания песни / черновика в студии. */
export function studioAddSongPath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook/studio/new' : '/studio/add-song';
}

/** Единый URL редактора студии (внутри раздела песенника). */
export function studioEditSongPath(songId: number): string {
  return `/songbook/studio/edit/${songId}`;
}

/** Пропсы Link для перехода в редактор с запоминанием экрана, откуда открыли. */
export type StudioEditSongLinkProps = {
  to: string;
  state?: StudioEditorLocationState;
};

export function studioEditSongLink(songId: number, backTo?: string): StudioEditSongLinkProps {
  const to = studioEditSongPath(songId);
  if (!backTo?.startsWith('/')) return { to };
  return { to, state: { backTo } };
}
export function resolveStudioEditorBackTo(
  locationState: unknown,
  surface: StudioModuleSurface,
): string {
  const backTo = (locationState as StudioEditorLocationState | null)?.backTo;
  if (typeof backTo === 'string' && backTo.startsWith('/')) return backTo;
  return studioMySongsPath(surface);
}

/** Текущий URL — куда вернуться из редактора при открытии отсюда. */
export function useStudioEditorBackTo(): string {
  const { pathname, search } = useLocation();
  return `${pathname}${search}`;
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

export function studioSongUsagePath(surface: StudioModuleSurface): string {
  return surface === 'songbook' ? '/songbook/song-usage' : '/studio/song-usage';
}

/** База путей для страниц, общих для `/songbook/...` и `/studio/...`. */
export function useStudioModuleSurface(): StudioModuleSurface {
  const { pathname } = useLocation();
  return getStudioModuleSurface(pathname);
}
