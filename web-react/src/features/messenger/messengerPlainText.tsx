import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { appPathFromHref } from '../pwa/pwaInAppPath';
import { normalizeChatDisplayText } from './normalizeChatDisplayText';

const PLAIN_CHUNK_RE = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|\d[\d.:,\/-]*)/g;

const DEFAULT_LINK_CLASS =
  'break-all font-semibold text-primary underline decoration-primary/40 underline-offset-2';

/**
 * Same-origin URL → in-app path; meeting invites (`/call/join/…`) even across sibling hosts
 * (so iOS PWA does not escape to Safari via target=_blank).
 */
export function appPathFromAbsoluteUrl(url: string): string | null {
  return appPathFromHref(url);
}

function MessengerAppLink({
  url,
  hrefPath,
  className,
}: {
  url: string;
  hrefPath: string;
  className?: string;
}) {
  const location = useLocation();
  const backTo = `${location.pathname}${location.search}${location.hash}` || '/messenger';
  const backLabel = location.pathname.startsWith('/messenger') ? 'В чат' : 'Назад';

  return (
    <Link
      to={hrefPath}
      state={{ backTo, backLabel }}
      className={className ?? DEFAULT_LINK_CLASS}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      {url}
    </Link>
  );
}

function renderMessengerUrl(key: string, url: string, linkClassName?: string): ReactNode {
  const appPath = appPathFromAbsoluteUrl(url);
  if (appPath) {
    return (
      <MessengerAppLink key={key} url={url} hrefPath={appPath} className={linkClassName} />
    );
  }

  return (
    <a
      key={key}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName ?? DEFAULT_LINK_CLASS}
      onClick={(e) => e.stopPropagation()}
    >
      {url}
    </a>
  );
}

/** Разбивает plain-текст: URL — ссылкой, цифры — в <bdi> (Chromium/Android WebView BiDi). */
export function renderMessengerPlainText(
  text: string,
  keyPrefix = 'm',
  linkClassName?: string,
): ReactNode[] {
  const normalized = normalizeChatDisplayText(text);
  const chunks = normalized.split(PLAIN_CHUNK_RE);

  return chunks
    .map((chunk, i) => {
      if (!chunk) return null;
      if (/^https?:\/\//i.test(chunk)) {
        return renderMessengerUrl(`${keyPrefix}-u-${i}`, chunk, linkClassName);
      }
      if (/^\d[\d.:,\/-]*$/.test(chunk)) {
        return (
          <bdi key={`${keyPrefix}-d-${i}`} className="messenger-digit-run">
            {chunk}
          </bdi>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{chunk}</span>;
    })
    .filter(Boolean) as ReactNode[];
}

export function MessengerPlainText({
  text,
  className,
  keyPrefix = 'm',
  linkClassName,
}: {
  text: string;
  className?: string;
  keyPrefix?: string;
  linkClassName?: string;
}) {
  return (
    <span className={className}>
      {renderMessengerPlainText(text, keyPrefix, linkClassName)}
    </span>
  );
}
