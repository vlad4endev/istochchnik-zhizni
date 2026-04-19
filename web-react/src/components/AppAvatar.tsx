import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';

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
};

export function AppAvatar({
  src,
  fallback,
  alt = '',
  className = '',
  imgClassName = 'h-full w-full object-cover',
  style,
  priority = false,
  loading,
  fetchPriority,
}: AppAvatarProps) {
  const resolvedSrc = useMemo(() => resolvePublicUrl(src ?? null), [src]);
  const [loadFailed, setLoadFailed] = useState(false);

  const effectiveLoading = loading ?? (priority ? 'eager' : 'lazy');
  const effectiveFetchPriority = fetchPriority ?? (priority ? 'high' : 'auto');

  useEffect(() => {
    setLoadFailed(false);
  }, [resolvedSrc]);

  const showImage = Boolean(resolvedSrc) && !loadFailed;

  return (
    <div className={className} style={style}>
      {showImage ? (
        <img
          src={resolvedSrc ?? undefined}
          alt={alt}
          className={imgClassName}
          loading={effectiveLoading}
          decoding="async"
          fetchPriority={effectiveFetchPriority}
          referrerPolicy="no-referrer"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

