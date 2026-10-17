import { useAuthenticatedApiBlobSrc } from '../../../lib/useAuthenticatedApiBlobSrc';

/** Картинка вложения мессенджера: прокси-URL требует авторизацию, поэтому грузим через blob. */
export function AuthImg({ src, className }: { src: string; className?: string }) {
  const resolved = useAuthenticatedApiBlobSrc(src);
  if (!resolved) return <span className={className} aria-hidden />;
  return <img src={resolved} alt="" className={className} loading="lazy" decoding="async" />;
}
