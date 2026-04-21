import type { RefCallback } from 'react';
import { LuChevronDown, LuChevronUp, LuTrash2 } from 'react-icons/lu';

import { splitPasteByDoubleNewlines, type SongBlock, type SongBlockType } from './songBlocks';

const BADGE: Record<SongBlockType, string> = {
  intro: 'INTRO',
  verse: 'VERSE',
  chorus: 'CHORUS',
  bridge: 'BRIDGE',
};

type BlockWrapperProps = {
  block: SongBlock;
  shellEditor: string;
  darkUi: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onFocusBlock: (id: string) => void;
  onSelectBlock: (id: string, start: number, end: number) => void;
  /** Вставка большого текста с абзацами — разбить на несколько блоков */
  onSmartPasteSplit?: (id: string, paragraphs: string[]) => void;
  textareaRef?: RefCallback<HTMLTextAreaElement>;
};

export function BlockWrapper({
  block,
  shellEditor,
  darkUi,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
  onFocusBlock,
  onSelectBlock,
  onSmartPasteSplit,
  textareaRef,
}: BlockWrapperProps) {
  const card = darkUi
    ? 'border-slate-800 bg-slate-950/50 ring-1 ring-slate-800/80'
    : 'border-stone-200 bg-white ring-1 ring-stone-200/90';

  const badge = darkUi
    ? 'border-slate-700 bg-slate-900 text-[10px] font-bold tracking-wide text-slate-300'
    : 'border-stone-200 bg-stone-100 text-[10px] font-bold tracking-wide text-stone-700';

  const iconBtn = darkUi
    ? 'rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    : 'rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900';

  return (
    <div className={`rounded-2xl border p-3 ${card}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 ${badge}`}
          title={block.sectionHint ?? BADGE[block.type]}
        >
          {BADGE[block.type]}
          {block.sectionHint ? (
            <span className="ml-1.5 max-w-[10rem] truncate font-normal normal-case opacity-80">
              · {block.sectionHint}
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(block.id, -1)}
            className={`inline-flex h-9 w-9 items-center justify-center disabled:opacity-35 ${iconBtn}`}
            aria-label="Выше"
          >
            <LuChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(block.id, 1)}
            className={`inline-flex h-9 w-9 items-center justify-center disabled:opacity-35 ${iconBtn}`}
            aria-label="Ниже"
          >
            <LuChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(block.id)}
            className={`inline-flex h-9 w-9 items-center justify-center text-red-500 hover:bg-red-500/10 ${iconBtn}`}
            aria-label="Удалить блок"
          >
            <LuTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <textarea
        value={block.content}
        onChange={(e) => onChange(block.id, e.target.value)}
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
        ref={textareaRef}
        className={`min-h-[140px] w-full resize-y rounded-xl px-3 py-3 font-mono text-[15px] leading-relaxed outline-none ${shellEditor}`}
        spellCheck={false}
        placeholder="ChordPro: [Am]текст…"
        aria-label={`Редактор блока ${BADGE[block.type]}`}
      />
    </div>
  );
}
