import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import { getAvatarColor, getAvatarInitial } from '../features/messenger/avatarUtils';

type AppAvatarProps = {
  src?: string | null;
  fallback: ReactNode;
  alt?: string;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  /** Видимые аватары в списке/шапке — без lazy, чтобы не «подтягивались» секундами. */
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
  /**
   * При ошибке загрузки картинки показать инициалы на фоне (тот же стиль, что в списке чатов).
   * Иначе используется `fallback`.
   */
  initialsFallbackText?: string | null;
  /** Отдельный seed для цвета (например id чата), иначе цвет от `initialsFallbackText`. */
  initialsColorSeed?: string | null;
};

export const AppAvatar = memo(function AppAvatar({
  src,
  fallback,
  alt = '',
  className = '',
  imgClassName = 'h-full w-full object-cover',
  style,
  priority = false,
  loading,
  fetchPriority,
  width,
  height,
  initialsFallbackText,
  initialsColorSeed,
}: AppAvatarProps) {
  const resolvedSrc = useMemo(() => resolvePublicUrl(src ?? null), [src]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const effectiveLoading = loading ?? (priority ? 'eager' : 'lazy');
  const effectiveFetchPriority = fetchPriority ?? (priority ? 'high' : 'auto');

  useEffect(() => {
    setLoadFailed(false);
    setIsLoaded(false);
  }, [resolvedSrc]);

  const showImage = Boolean(resolvedSrc) && !loadFailed;

  const initialsEl =
    initialsFallbackText != null && String(initialsFallbackText).trim() ? (
      <div
        className="grid h-full w-full place-items-center text-base font-bold text-white"
        style={{
          background: getAvatarColor(String(initialsColorSeed ?? initialsFallbackText ?? '')),
        }}
      >
        {getAvatarInitial(initialsFallbackText)}
      </div>
    ) : null;

  return (
    <div className={className} style={style}>
      {showImage ? (
        <div className="relative h-full w-full overflow-hidden">
          {!isLoaded ? (
            <span className="absolute inset-0 z-0 animate-pulse" aria-hidden>
              {initialsEl ?? fallback}
            </span>
          ) : null}
          <img
            src={resolvedSrc ?? undefined}
            alt={alt}
            className={[
              imgClassName,
              'relative z-[1] transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
            loading={effectiveLoading}
            decoding="async"
            fetchPriority={effectiveFetchPriority}
            width={width}
            height={height}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            onError={() => setLoadFailed(true)}
          />
        </div>
      ) : loadFailed && initialsEl ? (
        initialsEl
      ) : (
        fallback
      )}
    </div>
  );
});
