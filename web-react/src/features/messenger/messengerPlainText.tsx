import type { ReactNode } from 'react';

import { normalizeChatDisplayText } from './normalizeChatDisplayText';

/** Разбивает plain-текст: цифры в <bdi> (Chromium/Android WebView BiDi). */
export function renderMessengerPlainText(text: string, keyPrefix = 'm'): ReactNode[] {
  const normalized = normalizeChatDisplayText(text);
  const chunks = normalized.split(/(\d+)/g);

  return chunks
    .map((chunk, i) => {
      if (!chunk) return null;
      if (/^\d+$/.test(chunk)) {
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
}: {
  text: string;
  className?: string;
  keyPrefix?: string;
}) {
  return <span className={className}>{renderMessengerPlainText(text, keyPrefix)}</span>;
}
