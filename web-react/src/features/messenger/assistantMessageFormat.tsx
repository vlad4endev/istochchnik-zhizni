import type { ReactNode } from 'react';

import { renderMessengerPlainText } from './messengerPlainText';

/**
 * Нормализация ответов LLM к читаемому Markdown:
 * - снимает экранирование `\-`, `\*`;
 * - схлопывает «разъехавшиеся» жирные маркеры `* *текст* *` → `**текст**`;
 * - убирает лишние пробелы вокруг `**`.
 */
export function normalizeAssistantMarkdown(raw: string): string {
  let s = String(raw ?? '')
    .replace(/\\([-*_`#>])/g, '$1')
    .replace(/\r\n/g, '\n');

  // `* *Важно* *` / `* * Важно * *` → `**Важно**`
  s = s.replace(/\*\s+\*\s*([^*\n]+?)\s*\*\s+\*/g, '**$1**');
  // лишние пробелы внутри `** … **`
  s = s.replace(/\*\*\s+([^*\n]+?)\s+\*\*/g, '**$1**');
  s = s.replace(/\*\*\s+([^*\n]+?)\*\*/g, '**$1**');
  s = s.replace(/\*\*([^*\n]+?)\s+\*\*/g, '**$1**');

  return s.trim();
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  linkClassName?: string,
): ReactNode[] {
  // Сначала жирный/код, затем одиночный курсив по оставшимся кускам
  const primary = text.split(/(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+`)/g);
  const out: ReactNode[] = [];

  primary.forEach((part, i) => {
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
    const code = part.match(/^`([^`\n]+)`$/);
    if (code) {
      out.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10"
        >
          {code[1]}
        </code>,
      );
      return;
    }

    const italicParts = part.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
    italicParts.forEach((ip, j) => {
      if (!ip) return;
      const italic = ip.match(/^\*([^*\n]+)\*$/) || ip.match(/^_([^_\n]+)_$/);
      if (italic) {
        out.push(
          <em key={`${keyPrefix}-i-${i}-${j}`} className="italic">
            {renderMessengerPlainText(italic[1]!, `${keyPrefix}-ii-${i}-${j}`, linkClassName)}
          </em>,
        );
        return;
      }
      out.push(...renderMessengerPlainText(ip, `${keyPrefix}-t-${i}-${j}`, linkClassName));
    });
  });
  return out;
}

function isListLine(line: string): boolean {
  // Не считаем `**жирный**` и `*курсив*` началом списка
  if (/^\s*\*\*/.test(line)) return false;
  if (/^\s*\*[^*\s]/.test(line)) return false;
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
}

function listItemBody(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function blockquoteBody(line: string): string {
  return line.replace(/^\s*>\s?/, '');
}

function headingMatch(line: string): { level: number; text: string } | null {
  const m = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
  if (!m) return null;
  return { level: m[1]!.length, text: m[2]! };
}

/**
 * Рендер ответов ИИ: заголовки, абзацы, списки, цитаты, **жирный**, *курсив*.
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

    const heading = headingMatch(line);
    if (heading) {
      const Tag = (`h${Math.min(heading.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4');
      const size =
        heading.level <= 2
          ? 'text-[15px] font-bold'
          : heading.level === 3
            ? 'text-[14px] font-bold'
            : 'text-[13px] font-semibold';
      blocks.push(
        <Tag key={`h-${blockIdx}`} className={`mb-1.5 mt-2 first:mt-0 ${size} leading-snug`}>
          {renderInlineMarkdown(heading.text, `h-${blockIdx}`, linkClassName)}
        </Tag>,
      );
      blockIdx += 1;
      i += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && isBlockquoteLine(lines[i] ?? '')) {
        quoteLines.push(blockquoteBody(lines[i] ?? ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq-${blockIdx}`}
          className="my-1.5 border-l-[3px] border-current/35 pl-3 italic leading-relaxed opacity-95"
        >
          {quoteLines.map((ql, j) => (
            <p key={`bq-${blockIdx}-${j}`} className="mb-1 last:mb-0">
              {renderInlineMarkdown(ql || '\u00a0', `q-${blockIdx}-${j}`, linkClassName)}
            </p>
          ))}
        </blockquote>,
      );
      blockIdx += 1;
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
      if (headingMatch(cur) || isListLine(cur) || isBlockquoteLine(cur)) break;
      para.push(cur);
      i += 1;
    }
    blocks.push(
      <p key={`p-${blockIdx}`} className="mb-1.5 last:mb-0 whitespace-pre-wrap leading-relaxed">
        {renderInlineMarkdown(para.join('\n'), `p-${blockIdx}`, linkClassName)}
      </p>,
    );
    blockIdx += 1;
  }

  return <div className="assistant-md messenger-bidi-text">{blocks}</div>;
}
