import type { ReactNode } from 'react';

import { renderMessengerPlainText } from './messengerPlainText';

/** Убрать экранирование, типичное для ответов LLM (`\-`, `\*`). */
export function normalizeAssistantMarkdown(raw: string): string {
  return String(raw ?? '')
    .replace(/\\([-*_`])/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim();
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  linkClassName?: string,
): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+?\*\*|__[^_\n]+?__)/g);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    const bold = part.match(/^\*\*([^*\n]+)\*\*$/) || part.match(/^__([^_\n]+)__$/);
    if (bold) {
      out.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold">
          {renderMessengerPlainText(bold[1]!, `${keyPrefix}-bi-${i}`, linkClassName)}
        </strong>,
      );
      return;
    }
    out.push(...renderMessengerPlainText(part, `${keyPrefix}-t-${i}`, linkClassName));
  });
  return out;
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
}

function listItemBody(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
}

/**
 * Лёгкий рендер ответов ИИ: абзацы, списки, **жирный**.
 * Без полноценного Markdown-парсера — достаточно для читаемых ответов в чате.
 */
export function renderAssistantMessageContent(
  raw: string,
  opts?: { isMine?: boolean },
): ReactNode {
  const text = normalizeAssistantMarkdown(raw);
  if (!text) return null;

  const linkClassName = opts?.isMine
    ? 'break-all font-semibold text-sky-100 underline decoration-white/40 underline-offset-2'
    : undefined;

  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isListLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i] ?? '')) {
        items.push(listItemBody(lines[i] ?? ''));
        i += 1;
      }
      blocks.push(
        <ul
          key={`ul-${blockIdx}`}
          className="my-1.5 list-disc space-y-1 pl-4 marker:text-current"
        >
          {items.map((item, j) => (
            <li key={`li-${blockIdx}-${j}`} className="leading-snug">
              {renderInlineMarkdown(item, `a-${blockIdx}-${j}`, linkClassName)}
            </li>
          ))}
        </ul>,
      );
      blockIdx += 1;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? '';
      if (!cur.trim()) break;
      if (isListLine(cur)) break;
      para.push(cur);
      i += 1;
    }
    blocks.push(
      <p key={`p-${blockIdx}`} className="mb-1.5 last:mb-0 leading-relaxed">
        {renderInlineMarkdown(para.join(' '), `p-${blockIdx}`, linkClassName)}
      </p>,
    );
    blockIdx += 1;
  }

  return <div className="assistant-md messenger-bidi-text">{blocks}</div>;
}
