import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FaAndroid } from 'react-icons/fa';
import { LuArrowRight, LuDownload } from 'react-icons/lu';

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
    <section aria-label={isUpdate ? 'Обновление Android-приложения' : 'Приложение Android'}>
      <a
        href={href}
        download={downloadName}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        onClick={onActivate}
        className={[
          'group relative block cursor-pointer overflow-hidden rounded-3xl no-underline outline-none',
          'border border-[#3DDC84]/40 bg-gradient-to-br from-[#E9F7EE] via-white to-[#F4F9E9]',
          'p-4 text-inherit shadow-[var(--shadow-card)] transition-all duration-300 sm:p-5',
          'hover:-translate-y-0.5 hover:border-[#3DDC84]/70 hover:shadow-[0_20px_44px_-18px_rgba(27,94,32,0.4)]',
          'focus-visible:ring-2 focus-visible:ring-[#3DDC84] focus-visible:ring-offset-2',
          'dark:border-[#3DDC84]/25 dark:from-[#0C2417] dark:via-[var(--surface-elevated)] dark:to-[#0F2A1B]',
          'motion-reduce:transition-none motion-reduce:hover:transform-none',
        ].join(' ')}
      >
        <span
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#3DDC84]/25 blur-2xl dark:bg-[#3DDC84]/15"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-14 -right-10 text-[#1B5E20]/[0.07] dark:text-[#3DDC84]/[0.08]"
          aria-hidden
        >
          <FaAndroid className="h-40 w-40" />
        </span>

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <span
            className={[
              'grid h-14 w-14 shrink-0 place-items-center rounded-2xl',
              'bg-gradient-to-br from-[#3DDC84] to-[#1FA95C] text-[#05301D]',
              'shadow-[0_12px_26px_-10px_rgba(31,169,92,0.65)] ring-1 ring-white/50',
              'transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none',
            ].join(' ')}
            aria-hidden
          >
            <FaAndroid className="h-8 w-8" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#1B5E20] dark:text-[#81C784]">
                Android
              </span>
              <span className="rounded-full bg-[#3DDC84]/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#1B5E20] ring-1 ring-[#3DDC84]/30 dark:text-[#A5D6A7]">
                {isUpdate ? 'Обновление' : 'Приложение'}
              </span>
            </p>
            <h2 className="mt-1.5 text-[17px] font-extrabold leading-snug text-stone-900 dark:text-[var(--text)]">
              {isUpdate ? 'Доступно обновление приложения' : 'Доступно полноценное приложение'}
            </h2>
            <p className="mt-1 text-sm font-medium leading-relaxed text-stone-600 dark:text-[var(--text-muted)]">
              {release.title?.trim() ||
                (isUpdate
                  ? 'Нажмите, чтобы скачать новую сборку и обновить приложение.'
                  : 'Нажмите, чтобы скачать и установить APK на устройство.')}
            </p>
            {versionLabel || sizeLabel ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {versionLabel ? (
                  <span className="inline-flex items-center rounded-full bg-[#073042]/[0.06] px-2.5 py-1 text-[11px] font-bold text-stone-700 ring-1 ring-[#073042]/10 dark:bg-white/10 dark:ring-white/10">
                    Версия {versionLabel}
                  </span>
                ) : null}
                {sizeLabel ? (
                  <span className="inline-flex items-center rounded-full bg-[#073042]/[0.06] px-2.5 py-1 text-[11px] font-bold text-stone-700 ring-1 ring-[#073042]/10 dark:bg-white/10 dark:ring-white/10">
                    {sizeLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 sm:text-center">
            <span
              className={[
                'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 sm:w-auto',
                'bg-[#073042] text-sm font-extrabold text-white',
                'shadow-[0_12px_26px_-10px_rgba(7,48,66,0.75)]',
                'transition-colors duration-200 group-hover:bg-[#0C4258] motion-reduce:transition-none',
              ].join(' ')}
            >
              <LuDownload className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
              {isUpdate ? 'Скачать обновление' : 'Скачать APK'}
              <LuArrowRight
                className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden
              />
            </span>
            <p className="mt-2 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              Бесплатно · без Google Play
            </p>
          </div>
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
