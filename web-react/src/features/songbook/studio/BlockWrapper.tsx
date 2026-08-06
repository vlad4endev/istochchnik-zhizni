import { useLayoutEffect, useRef, useState, type HTMLAttributes, type RefCallback } from 'react';
import { LuChevronDown, LuChevronUp, LuCopy, LuGripVertical, LuPencil, LuTrash2 } from 'react-icons/lu';

import { splitPasteByDoubleNewlines, type SongBlock, type SongBlockType } from './songBlocks';

const BADGE: Record<SongBlockType, string> = {
  intro: 'INTRO',
  verse: 'VERSE',
  prechorus: 'PRE-CHORUS',
  chorus: 'CHORUS',
  bridge: 'BRIDGE',
  solo: 'SOLO',
  outro: 'OUTRO',
};

const ACCENT_BY_TYPE: Record<SongBlockType, string> = {
  intro: 'border-l-emerald-500',
  verse: 'border-l-sky-500',
  prechorus: 'border-l-amber-400',
  chorus: 'border-l-orange-500',
  bridge: 'border-l-violet-500',
  solo: 'border-l-fuchsia-500',
  outro: 'border-l-slate-400',
};

type BlockWrapperProps = {
  block: SongBlock;
  shellEditor: string;
  darkUi: boolean;
  isFirst: boolean;
  isLast: boolean;
  isActive?: boolean;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate?: (id: string) => void;
  onRename?: (id: string, sectionHint: string) => void;
  onFocusBlock: (id: string) => void;
  onSelectBlock: (id: string, start: number, end: number) => void;
  /** Вставка большого текста с абзацами — разбить на несколько блоков */
  onSmartPasteSplit?: (id: string, paragraphs: string[]) => void;
  textareaRef?: RefCallback<HTMLTextAreaElement>;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
};

export function BlockWrapper({
  block,
  shellEditor,
  darkUi,
  isFirst,
  isLast,
  isActive = false,
  onChange,
  onDelete,
  onMove,
  onDuplicate,
  onRename,
  onFocusBlock,
  onSelectBlock,
  onSmartPasteSplit,
  textareaRef,
  dragHandleProps,
}: BlockWrapperProps) {
  const [renaming, setRenaming] = useState(false);
  const [sectionName, setSectionName] = useState(block.sectionHint ?? '');
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const card = darkUi
    ? `border-[var(--border)] bg-[var(--bg-card)] ring-1 ${isActive ? 'ring-sky-400/80' : 'ring-[var(--border)]'}`
    : `border-[var(--border)] bg-[var(--surface-elevated)] ring-1 ${isActive ? 'ring-sky-400/70' : 'ring-[var(--border)]'}`;

  const badge = darkUi
    ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] font-bold tracking-wide text-[var(--text-secondary)]'
    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] font-bold tracking-wide text-[var(--text-secondary)]';

  const iconBtn = darkUi
    ? 'rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
    : 'rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]';

  useLayoutEffect(() => {
    const el = localTextareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 116)}px`;
  }, [block.content, renaming]);

  return (
    <div
      className={`group rounded-2xl border border-l-4 p-3 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${ACCENT_BY_TYPE[block.type]} ${card}`}
    >
      <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="inline-flex min-w-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition sm:h-7 sm:w-7 ${
              darkUi
                ? 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
            }`}
            aria-label="Перетащить блок"
            {...dragHandleProps}
          >
            <LuGripVertical className="h-4 w-4" />
          </button>
          <span
            className={`inline-flex min-w-0 max-w-full items-center rounded-md border px-2 py-1 sm:px-2.5 ${badge}`}
            title={block.sectionHint ?? BADGE[block.type]}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] sm:text-[12px]">
              {BADGE[block.type]}
            </span>
            {block.sectionHint ? (
              <span className="ml-1.5 max-w-[9rem] truncate text-[13px] font-medium normal-case opacity-90 sm:ml-2 sm:max-w-[14rem] sm:text-[14px]">
                · {block.sectionHint}
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-0.5 opacity-100 transition sm:w-auto sm:gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(block.id, -1)}
            className={`inline-flex h-8 w-8 items-center justify-center disabled:opacity-35 sm:h-9 sm:w-9 ${iconBtn}`}
            aria-label="Выше"
          >
            <LuChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(block.id, 1)}
            className={`inline-flex h-8 w-8 items-center justify-center disabled:opacity-35 sm:h-9 sm:w-9 ${iconBtn}`}
            aria-label="Ниже"
          >
            <LuChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRenaming((v) => !v)}
            className={`inline-flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9 ${iconBtn}`}
            aria-label="Переименовать блок"
          >
            <LuPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate?.(block.id)}
            className={`inline-flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9 ${iconBtn}`}
            aria-label="Дублировать блок"
          >
            <LuCopy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(block.id)}
            className={`inline-flex h-8 w-8 items-center justify-center text-red-500 hover:bg-red-500/10 sm:h-9 sm:w-9 ${iconBtn}`}
            aria-label="Удалить блок"
          >
            <LuTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {renaming ? (
        <div className="mb-2 flex items-center gap-2">
          <input
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            placeholder="Название блока"
            className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm outline-none ${shellEditor}`}
          />
          <button
            type="button"
            onClick={() => {
              onRename?.(block.id, sectionName.trim());
              setRenaming(false);
            }}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-primary)] hover:bg-[var(--primary-dark)]"
          >
            OK
          </button>
        </div>
      ) : null}
      <textarea
        value={block.content}
        onChange={(e) => onChange(block.id, e.target.value)}
        onInput={(e) => {
          const target = e.currentTarget;
          target.style.height = '0px';
          target.style.height = `${Math.max(target.scrollHeight, 116)}px`;
        }}
        onFocus={() => onFocusBlock(block.id)}
        onSelect={(e) => {
          const t = e.currentTarget;
          onSelectBlock(block.id, t.selectionStart, t.selectionEnd);
        }}
        onKeyUp={(e) => {
          const t = e.currentTarget;
          onSelectBlock(block.id, t.selectionStart, t.selectionEnd);
        }}
        onMouseUp={(e) => {
          const t = e.currentTarget;
          onSelectBlock(block.id, t.selectionStart, t.selectionEnd);
        }}
        onPaste={
          onSmartPasteSplit
            ? (e) => {
                const text = e.clipboardData.getData('text/plain');
                const paras = splitPasteByDoubleNewlines(text);
                if (text.trim().length > 350 && paras.length >= 2) {
                  e.preventDefault();
                  onSmartPasteSplit(block.id, paras);
                }
              }
            : undefined
        }
        ref={(el) => {
          localTextareaRef.current = el;
          textareaRef?.(el);
        }}
        rows={3}
        className={`w-full rounded-xl px-3 py-3 font-["JetBrains_Mono","Fira_Code","Courier_New",monospace] text-[16px] leading-[2] outline-none resize-none overflow-y-auto sm:px-4 sm:leading-[1.8] ${shellEditor}`}
        spellCheck={false}
        placeholder={'# Куплет 1\n[Am]Когда качаются [C]фонарики\n\n# Припев\n[F]Пой со мной'}
        aria-label={`Редактор блока ${BADGE[block.type]}`}
      />
    </div>
  );
}
