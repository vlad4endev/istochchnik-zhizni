import type { ReactNode } from 'react';

import { displayMessengerText } from './normalizeChatDisplayText';

/** Разбивает plain-текст: цифры в изолированный LTR-span (BiDi Safari / Android WebView). */
export function renderMessengerPlainText(text: string, keyPrefix = 'm'): ReactNode[] {
  const normalized = displayMessengerText(text);
  const chunks = normalized.split(/(\d+)/g);

  return chunks
    .map((chunk, i) => {
      if (!chunk) return null;
      if (/^\d+$/.test(chunk)) {
        return (
          <span key={`${keyPrefix}-d-${i}`} className="messenger-digit-run" dir="ltr">
            {chunk}
          </span>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{chunk}</span>;
    })
    .filter(Boolean) as ReactNode[];
}
