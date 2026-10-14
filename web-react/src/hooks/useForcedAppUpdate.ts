import { useEffect, useState } from 'react';

import { apiClient } from '../lib/apiClient';

type ReleaseInfo = {
  version_name?: string;
  version_code?: number;
  force_update?: boolean;
  min_version_code?: number;
  download_url?: string;
};

/**
 * Polls active app release; if force_update / min_version exceeded, expose banner state.
 */
export function useForcedAppUpdate(): {
  forceUpdate: boolean;
  message: string | null;
  downloadUrl: string | null;
} {
  const [forceUpdate, setForceUpdate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<ReleaseInfo | ReleaseInfo[]>('/api/app-releases/active', {
          silentErrorToast: true,
          skipAuthClearOn401: true,
        } as never);
        const release = Array.isArray(data) ? data[0] : data;
        if (!release || cancelled) return;
        const current = Number(import.meta.env.VITE_APP_VERSION_CODE ?? 0) || 0;
        const min = Number(release.min_version_code ?? 0) || 0;
        const forced = Boolean(release.force_update) || (min > 0 && current > 0 && current < min);
        setForceUpdate(forced);
        setMessage(forced ? 'Доступна обязательная обновлённая версия приложения' : null);
        setDownloadUrl(release.download_url ?? null);
      } catch {
        /* endpoint may be admin-only or empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { forceUpdate, message, downloadUrl };
}
