import type { ReactNode } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Подсвечивает слова поискового запроса прямо в тексте стиха (клиентская подсветка —
 * бэкенд ищет по лемме через ts_rank, а не по точной подстроке, поэтому серверную
 * ts_headline-разметку сюда не натянуть без потери точности совпадения).
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const words = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2),
    ),
  );
  if (words.length === 0) return text;

  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  // Один capture-group → split чередует [не-совпадение, совпадение, не-совпадение, ...];
  // индекс чётный/нечётный надёжнее, чем stateful .test() на глобальном regexp (lastIndex).
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-stone-900">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
