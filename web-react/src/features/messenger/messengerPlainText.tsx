import type { ReactNode } from 'react';

import { normalizeChatDisplayText } from './normalizeChatDisplayText';

const PLAIN_CHUNK_RE = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|\d[\d.:,\/-]*)/g;

function renderMessengerUrl(key: string, url: string, linkClassName?: string): ReactNode {
  return (
    <a
      key={key}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        linkClassName ??
        'break-all font-semibold text-primary underline decoration-primary/40 underline-offset-2'
      }
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
