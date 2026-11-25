import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FaAndroid } from 'react-icons/fa';
import { LuDownload } from 'react-icons/lu';

import { fetchLatestAppRelease, type AppReleaseLatest } from '../../admin/api';
import { getApiBaseUrlFromEnv } from '../../../lib/config';

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

/**
 * Голый `/uploads/releases/…` на боевом сайте не проксируется (запрос висит без ответа).
 * Тот же файл доступен как `/api/uploads/releases/…`.
 */
export function resolveReleaseDownloadHref(url: string, apiBase = getApiBaseUrlFromEnv()): string {
  const u = url.trim();
  if (!u) return '';
  const rewritten = u.includes('/api/uploads/releases/')
    ? u
    : u.replace(
        /^(https?:\/\/[^/\s]+)?\/uploads\/releases\//,
        (_match, origin: string | undefined) => `${origin ?? ''}/api/uploads/releases/`,
      );
  const href =
    rewritten.startsWith('http://') ||
    rewritten.startsWith('https://') ||
    rewritten.startsWith('blob:') ||
    rewritten.startsWith('/')
      ? rewritten
      : `/${rewritten}`;
  if (!href.startsWith('/')) return href;
  const base = apiBase.trim().replace(/\/+$/, '');
  return base ? `${base}${href}` : href;
}

/** `download` на чужом origin в Chrome отменяет переход, и клик выглядит мёртвым. */
export function releaseDownloadFileName(
  href: string,
  fileName: string | null | undefined,
  pageOrigin?: string,
): string | undefined {
  const name = (fileName ?? '').trim();
  if (!name || /[/\\]/.test(name) || name.includes('..')) return undefined;
  if (/^https?:\/\//i.test(href)) {
    const origin = pageOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    try {
      if (!origin || new URL(href).origin !== origin) return undefined;
    } catch {
      return undefined;
    }
  }
  return name;
}

export function releaseLinkOpensNewTab(href: string, pageOrigin?: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  const origin = pageOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  try {
    if (!origin) return true;
    return new URL(href).origin !== origin;
  } catch {
    return true;
  }
}

type ViewProps = {
  release: AppReleaseLatest;
  isUpdate: boolean;
  href: string;
  downloadName?: string;
  openInNewTab: boolean;
  onActivate: () => void;
};

export function AndroidAppReleaseWidgetView({
  release,
  isUpdate,
  href,
  downloadName,
  openInNewTab,
  onActivate,
}: ViewProps) {
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
      <a
        href={href}
        download={downloadName}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        onClick={onActivate}
        className={[
          'flex w-full cursor-pointer items-start gap-3 text-left no-underline outline-none',
          'rounded-xl text-inherit focus-visible:ring-2 focus-visible:ring-[#3DDC84] focus-visible:ring-offset-2',
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
      </a>
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

  const href = resolveReleaseDownloadHref(release.download_url);
  if (!href) return null;
  const downloadName = releaseDownloadFileName(href, release.file_name);
  const openInNewTab = releaseLinkOpensNewTab(href);

  const onActivate = () => {
    markReleaseSeen(release.id);
    setSeenId(release.id);
  };

  return (
    <div className="pt-3 pb-1 sm:pt-4 lg:pt-4">
      <AndroidAppReleaseWidgetView
        release={release}
        isUpdate={isUpdate}
        href={href}
        downloadName={downloadName}
        openInNewTab={openInNewTab}
        onActivate={onActivate}
      />
    </div>
  );
}
