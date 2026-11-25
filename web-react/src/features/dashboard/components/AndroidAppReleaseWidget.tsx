import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FaAndroid } from 'react-icons/fa';
import { LuArrowRight, LuDownload } from 'react-icons/lu';

import { fetchLatestAppRelease, type AppReleaseLatest } from '../../admin/api';
import { getApiBaseUrlFromEnv } from '../../../lib/config';
import { isCapacitorNative } from '../../../lib/nativeApp';
import {
  hasNewerRelease,
  isBannerDismissedForRelease,
  markReleaseDownloaded,
  notifyUpdateBannerVisibilityChanged,
  onUpdateBannerVisibilityChanged,
  readInstalledVersionCode,
} from '../../../lib/appVersion';

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

/**
 * APK не ставится на iPhone/iPad, а скачивание файлов в iOS (и в iOS PWA) системой не
 * поддерживается — кнопка там заведомо «не работает». На этих устройствах виджет прячем.
 */
export function isAppleMobileDevice(userAgent?: string): boolean {
  const ua = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  // iPadOS 13+ в «десктопном» режиме выдаёт себя за macOS
  return (
    ua.includes('macintosh') &&
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints ?? 0) > 1
  );
}

/** Android-браузер или Android-PWA — только им полезно предложение установить APK. */
export function isAndroidDevice(userAgent?: string): boolean {
  const ua = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).toLowerCase();
  return ua.includes('android');
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
          'group relative block cursor-pointer overflow-hidden rounded-2xl no-underline outline-none sm:rounded-3xl',
          'border border-[#3DDC84]/40 bg-gradient-to-br from-[#E9F7EE] via-white to-[#F4F9E9]',
          'p-3.5 text-inherit shadow-[var(--shadow-card)] transition-all duration-300 sm:p-5',
          'hover:-translate-y-0.5 hover:border-[#3DDC84]/70 hover:shadow-[0_20px_44px_-18px_rgba(27,94,32,0.4)]',
          'focus-visible:ring-2 focus-visible:ring-[#3DDC84] focus-visible:ring-offset-2',
          'dark:border-[#3DDC84]/25 dark:from-[#0C2417] dark:via-[var(--surface-elevated)] dark:to-[#0F2A1B]',
          'motion-reduce:transition-none motion-reduce:hover:transform-none',
        ].join(' ')}
      >
        <span
          className="pointer-events-none absolute -right-16 -top-20 hidden h-48 w-48 rounded-full bg-[#3DDC84]/25 blur-2xl dark:bg-[#3DDC84]/15 sm:block"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -bottom-14 -right-10 hidden text-[#1B5E20]/[0.07] dark:text-[#3DDC84]/[0.08] sm:block"
          aria-hidden
        >
          <FaAndroid className="h-40 w-40" />
        </span>

        <div className="relative flex flex-wrap items-start gap-x-3 gap-y-3 sm:flex-nowrap sm:items-center sm:gap-5">
          <span
            className={[
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl',
              'bg-gradient-to-br from-[#3DDC84] to-[#1FA95C] text-[#05301D]',
              'shadow-[0_12px_26px_-10px_rgba(31,169,92,0.65)] ring-1 ring-white/50',
              'transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none',
            ].join(' ')}
            aria-hidden
          >
            <FaAndroid className="h-6 w-6 sm:h-8 sm:w-8" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#1B5E20] dark:text-[#81C784] sm:text-[11px]">
                Android
              </span>
              <span className="rounded-full bg-[#3DDC84]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#1B5E20] ring-1 ring-[#3DDC84]/30 dark:text-[#A5D6A7] sm:px-2 sm:text-[10px]">
                {isUpdate ? 'Обновление' : 'Приложение'}
              </span>
            </p>
            <h2 className="mt-1 text-[15px] font-extrabold leading-snug text-stone-900 dark:text-[var(--text)] sm:mt-1.5 sm:text-[17px]">
              {isUpdate ? 'Доступно обновление приложения' : 'Доступно полноценное приложение'}
            </h2>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-stone-600 dark:text-[var(--text-muted)] sm:mt-1 sm:text-sm sm:leading-relaxed">
              {release.title?.trim() ||
                (isUpdate
                  ? 'Нажмите, чтобы скачать новую сборку и обновить приложение.'
                  : 'Нажмите, чтобы скачать и установить APK на устройство.')}
            </p>
            {versionLabel || sizeLabel ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-2.5">
                {versionLabel ? (
                  <span className="inline-flex items-center rounded-full bg-[#073042]/[0.06] px-2 py-0.5 text-[10px] font-bold text-stone-700 ring-1 ring-[#073042]/10 dark:bg-white/10 dark:ring-white/10 sm:px-2.5 sm:py-1 sm:text-[11px]">
                    Версия {versionLabel}
                  </span>
                ) : null}
                {sizeLabel ? (
                  <span className="inline-flex items-center rounded-full bg-[#073042]/[0.06] px-2 py-0.5 text-[10px] font-bold text-stone-700 ring-1 ring-[#073042]/10 dark:bg-white/10 dark:ring-white/10 sm:px-2.5 sm:py-1 sm:text-[11px]">
                    {sizeLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="w-full shrink-0 sm:w-auto sm:text-center">
            <span
              className={[
                'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4',
                'bg-[#073042] text-[13px] font-extrabold text-white',
                'shadow-[0_12px_26px_-10px_rgba(7,48,66,0.75)]',
                'transition-colors duration-200 group-hover:bg-[#0C4258] motion-reduce:transition-none',
                'sm:min-h-[48px] sm:w-auto sm:rounded-2xl sm:px-5 sm:text-sm',
              ].join(' ')}
            >
              <LuDownload className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
              {isUpdate ? 'Скачать обновление' : 'Скачать APK'}
              <LuArrowRight
                className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden
              />
            </span>
            <p className="mt-2 hidden text-[11px] font-semibold text-stone-500 dark:text-stone-400 sm:block">
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
  /**
   * Промо «есть полноценное приложение» адресован только Android-вебу (браузер/PWA):
   * - iPhone/iPad — APK не ставится и скачивание в iOS не работает;
   * - десктоп — предложение поставить телефонное приложение там не к чему;
   * - нативный APK — приложение уже установлено, остаётся только режим «Обновление».
   */
  const [deviceMode] = useState<'native' | 'androidWeb' | 'hidden'>(() => {
    if (isAppleMobileDevice()) return 'hidden';
    if (isCapacitorNative()) return 'native';
    return isAndroidDevice() ? 'androidWeb' : 'hidden';
  });
  const [, forceTick] = useState(0);

  const latestQ = useQuery({
    queryKey: LATEST_KEY,
    queryFn: fetchLatestAppRelease,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: deviceMode !== 'hidden',
  });

  useEffect(
    () => onUpdateBannerVisibilityChanged(() => forceTick((v) => v + 1)),
    [],
  );

  const release = latestQ.data ?? null;

  const installedCode = readInstalledVersionCode();
  const updateAvailable = useMemo(
    () => hasNewerRelease(release?.version_code, installedCode),
    [release, installedCode],
  );

  const isUpdate = useMemo(() => {
    if (updateAvailable) return true;
    // Версию установить не удалось (старая сборка без константы, PWA) — эвристика «видел ли релиз».
    if (installedCode != null) return false;
    if (!release) return false;
    if (seenId == null) return false;
    return release.id !== seenId;
  }, [updateAvailable, installedCode, release, seenId]);

  if (deviceMode === 'hidden') return null;
  if (!release || !release.download_url?.trim()) return null;
  // Пока висит баннер обновления — виджет не дублируем; после «Позже» он вернётся.
  if (updateAvailable && !isBannerDismissedForRelease(release.id)) return null;
  // Внутри установленного приложения промо не показываем — только доступное обновление.
  if (deviceMode === 'native' && !isUpdate) return null;
  // Веб-Android со скачанной свежей сборкой — предложение уже выполнено.
  if (deviceMode === 'androidWeb' && installedCode != null && !updateAvailable) return null;

  const href = resolveReleaseDownloadHref(release.download_url);
  if (!href) return null;
  const downloadName = releaseDownloadFileName(href, release.file_name);
  const openInNewTab = releaseLinkOpensNewTab(href);

  const onActivate = () => {
    markReleaseSeen(release.id);
    setSeenId(release.id);
    markReleaseDownloaded(release.version_code);
    notifyUpdateBannerVisibilityChanged();
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
