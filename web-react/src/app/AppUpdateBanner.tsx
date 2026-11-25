import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaAndroid } from 'react-icons/fa';
import { LuDownload, LuX } from 'react-icons/lu';

import { fetchLatestAppRelease, type AppReleaseLatest } from '../features/admin/api';
import {
  isAppleMobileDevice,
  releaseDownloadFileName,
  releaseLinkOpensNewTab,
  resolveReleaseDownloadHref,
} from '../features/dashboard/components/AndroidAppReleaseWidget';
import {
  dismissBannerForRelease,
  hasNewerRelease,
  isBannerDismissedForRelease,
  markReleaseDownloaded,
  notifyUpdateBannerVisibilityChanged,
  onUpdateBannerVisibilityChanged,
  readInstalledVersionCode,
} from '../lib/appVersion';

const LATEST_KEY = ['app-release-latest'] as const;

type ViewProps = {
  release: AppReleaseLatest;
  href: string;
  onActivate: () => void;
  onDismiss: () => void;
};

export function AppUpdateBannerView({ release, href, onActivate, onDismiss }: ViewProps) {
  const downloadName = releaseDownloadFileName(href, release.file_name);
  const openInNewTab = releaseLinkOpensNewTab(href);
  const version =
    release.version_name.trim() ||
    (release.version_code != null ? `сборка ${release.version_code}` : 'приложения');
  const noteLine =
    release.notes
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';

  return (
    <div className="px-3 pt-2 sm:px-4 sm:pt-3" role="status">
      <div
        className={[
          'flex items-center gap-2.5 rounded-2xl border border-[#3DDC84]/40 px-3 py-2',
          'bg-gradient-to-r from-[#E9F7EE] to-white shadow-[0_8px_20px_-12px_rgba(27,94,32,0.35)]',
          'dark:border-[#3DDC84]/25 dark:from-[#0C2417] dark:to-[#0F2A1B]',
        ].join(' ')}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#3DDC84] to-[#1FA95C] text-[#05301D]"
          aria-hidden
        >
          <FaAndroid className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold leading-tight text-stone-900 dark:text-[var(--text)]">
            Доступно обновление {version}
          </p>
          {noteLine ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-stone-600 dark:text-[var(--text-muted)]">
              {noteLine}
            </p>
          ) : null}
        </div>
        <a
          href={href}
          download={downloadName}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noopener noreferrer' : undefined}
          onClick={onActivate}
          className={[
            'inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3',
            'bg-[#073042] text-[12px] font-extrabold text-white transition-colors hover:bg-[#0C4258]',
            'motion-reduce:transition-none',
          ].join(' ')}
        >
          <LuDownload className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          Обновить
        </a>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Позже"
          className="inline-flex min-h-[36px] shrink-0 items-center rounded-xl px-2 text-[12px] font-semibold text-stone-600 underline-offset-2 transition-colors hover:text-stone-900 dark:text-[var(--text-muted)]"
        >
          <LuX className="h-4 w-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Позже</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Компактный баннер «Доступно обновление» — показывается на любом экране, пока
 * установленная версия приложения старше последнего активного релиза.
 * На iPhone/iPad скрыт (APK туда не ставится), кнопка «Позже» прячет до следующего релиза.
 */
export function AppUpdateBanner() {
  const [hiddenOnThisDevice] = useState(() => isAppleMobileDevice());
  const [, forceTick] = useState(0);

  const latestQ = useQuery({
    queryKey: LATEST_KEY,
    queryFn: fetchLatestAppRelease,
    staleTime: 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: true,
    enabled: !hiddenOnThisDevice,
  });

  useEffect(
    () => onUpdateBannerVisibilityChanged(() => forceTick((v) => v + 1)),
    [],
  );

  const latest = latestQ.data ?? null;
  const installedCode = readInstalledVersionCode();

  if (hiddenOnThisDevice) return null;
  if (!latest || !latest.download_url.trim()) return null;
  if (!hasNewerRelease(latest.version_code, installedCode)) return null;
  if (isBannerDismissedForRelease(latest.id)) return null;

  const href = resolveReleaseDownloadHref(latest.download_url);
  if (!href) return null;

  const onActivate = () => {
    markReleaseDownloaded(latest.version_code);
    notifyUpdateBannerVisibilityChanged();
  };
  const onDismiss = () => {
    dismissBannerForRelease(latest.id);
    notifyUpdateBannerVisibilityChanged();
  };

  return (
    <AppUpdateBannerView release={latest} href={href} onActivate={onActivate} onDismiss={onDismiss} />
  );
}
