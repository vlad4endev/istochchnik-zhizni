import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FaAndroid } from 'react-icons/fa';
import { LuDownload } from 'react-icons/lu';

import { fetchLatestAppRelease, type AppReleaseLatest } from '../../admin/api';

const SEEN_RELEASE_KEY = 'android-app-release-seen-id';
const LATEST_KEY = ['app-release-latest'] as const;

function readSeenReleaseId(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_RELEASE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function markReleaseSeen(id: number): void {
  try {
    localStorage.setItem(SEEN_RELEASE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

function formatBytes(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function resolveDownloadHref(url: string): string {
  const u = url.trim();
  if (!u) return '#';
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('blob:')) return u;
  if (u.startsWith('/')) return u;
  return `/${u}`;
}

type ViewProps = {
  release: AppReleaseLatest;
  isUpdate: boolean;
  onDownload: () => void;
};

export function AndroidAppReleaseWidgetView({ release, isUpdate, onDownload }: ViewProps) {
  const sizeLabel = formatBytes(release.file_size_bytes);
  const versionLabel =
    release.version_name.trim() ||
    (release.version_code != null ? `сборка ${release.version_code}` : null);

  return (
    <section
      aria-label={isUpdate ? 'Обновление Android-приложения' : 'Приложение Android'}
      className={[
        'rounded-2xl border border-[#3DDC84]/35 bg-gradient-to-br from-[#E8F5E9] via-white to-[#F1F8E9]',
        'p-4 shadow-[var(--shadow-card)] sm:p-5',
        'dark:border-[#3DDC84]/25 dark:from-[#0d2818]/60 dark:via-[var(--surface-elevated)] dark:to-[#14301f]/40',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onDownload}
        className={[
          'flex w-full items-start gap-3 text-left outline-none',
          'rounded-xl focus-visible:ring-2 focus-visible:ring-[#3DDC84] focus-visible:ring-offset-2',
          'active:scale-[0.99] transition-transform',
        ].join(' ')}
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#3DDC84] text-[#073042] shadow-sm"
          aria-hidden
        >
          <FaAndroid className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1B5E20] dark:text-[#81C784]">
            Android
          </p>
          <h2 className="mt-1 text-base font-extrabold leading-snug text-stone-900 dark:text-[var(--text)]">
            {isUpdate
              ? 'Доступно обновление приложения'
              : 'Доступно полноценное приложение на ANDROID'}
          </h2>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-stone-600 dark:text-[var(--text-muted)]">
            {release.title?.trim() ||
              (isUpdate
                ? 'Нажмите, чтобы скачать новую сборку и обновить приложение.'
                : 'Нажмите, чтобы скачать и установить APK на устройство.')}
            {versionLabel ? (
              <span className="mt-1 block text-xs font-semibold text-stone-500 dark:text-stone-400">
                Версия {versionLabel}
                {sizeLabel ? ` · ${sizeLabel}` : ''}
              </span>
            ) : sizeLabel ? (
              <span className="mt-1 block text-xs font-semibold text-stone-500">{sizeLabel}</span>
            ) : null}
          </p>
          <span
            className={[
              'mt-3 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4',
              'bg-[#073042] text-sm font-extrabold text-white',
              'dark:bg-[#3DDC84] dark:text-[#073042]',
            ].join(' ')}
          >
            <LuDownload className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            {isUpdate ? 'Скачать обновление' : 'Скачать APK'}
          </span>
        </div>
      </button>
    </section>
  );
}

/** Home widget: visible only when an active release with a download URL exists. */
export function AndroidAppReleaseWidget() {
  const [seenId, setSeenId] = useState<number | null>(() => readSeenReleaseId());

  const latestQ = useQuery({
    queryKey: LATEST_KEY,
    queryFn: fetchLatestAppRelease,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const release = latestQ.data ?? null;

  const isUpdate = useMemo(() => {
    if (!release) return false;
    if (seenId == null) return false;
    return release.id !== seenId;
  }, [release, seenId]);

  if (!release || !release.download_url?.trim()) return null;

  const href = resolveDownloadHref(release.download_url);

  const onDownload = () => {
    markReleaseSeen(release.id);
    setSeenId(release.id);
    try {
      const a = document.createElement('a');
      a.href = href;
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      if (release.file_name) a.download = release.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="pt-3 pb-1 sm:pt-4 lg:pt-4">
      <AndroidAppReleaseWidgetView release={release} isUpdate={isUpdate} onDownload={onDownload} />
    </div>
  );
}
