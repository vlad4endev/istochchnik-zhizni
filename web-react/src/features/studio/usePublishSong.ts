import { useMutation, useQueryClient } from '@tanstack/react-query';

import { emitAppToast } from '../../lib/uiFeedback';
import { keys } from '@/lib/queryKeys';
import { publishSong, updateSong } from '../songbook/api';

import { saveVersion } from './api';

export type PublishSongInput = {
  songId: number;
  content?: string;
  customKey?: string | null;
  /** Сохранить правки в studio_versions перед публикацией. */
  saveVersionFirst?: boolean;
};

export function usePublishSong() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ songId, content, customKey, saveVersionFirst }: PublishSongInput) => {
      if (saveVersionFirst && content !== undefined) {
        await saveVersion(songId, {
          custom_content: content,
          custom_key: customKey ?? null,
        });
      }

      const trimmed = content?.trim() ?? '';
      if (trimmed) {
        try {
          await updateSong(songId, {
            content: trimmed,
            ...(customKey !== undefined && customKey !== null && customKey !== ''
              ? { default_key: customKey }
              : {}),
          });
        } catch {
          // Автор без прав PATCH — текст подтянет publishSongToCatalog из studio_versions.
        }
      }

      return publishSong(songId);
    },
    onSuccess: (_data, { songId }) => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: keys.songs });
      void qc.invalidateQueries({ queryKey: ['studio'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'public-catalog-sync-status'] });
      void qc.invalidateQueries({ queryKey: ['song', songId] });
      emitAppToast({ kind: 'success', message: 'Песня опубликована в общий каталог ✓' });
    },
    onError: () => {
      emitAppToast({ kind: 'error', message: 'Не удалось опубликовать песню' });
    },
  });
}
