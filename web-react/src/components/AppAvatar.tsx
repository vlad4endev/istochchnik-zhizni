import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';

type AppAvatarProps = {
  src?: string | null;
  fallback: ReactNode;
  alt?: string;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
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
  loading = 'lazy',
  fetchPriority = 'auto',
}: AppAvatarProps) {
  const resolvedSrc = useMemo(() => resolvePublicUrl(src ?? null), [src]);
  const [loadFailed, setLoadFailed] = useState(false);

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
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

